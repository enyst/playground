import argparse
import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd

import openhands
import openhands.agenthub  # noqa F401 (we import this to get the agents registered)
from evaluation.integration_tests.scripts.message_processing import (
    convert_event_to_messages,
)
from evaluation.integration_tests.scripts.utils import llm_anthropic_token_counter
from openhands.core.config.utils import get_llm_config_arg, load_app_config
from openhands.core.logger import openhands_logger as logger
from openhands.core.message import Message, TextContent
from openhands.events.action.agent import AgentSummarizeAction
from openhands.events.serialization.event import truncate_content
from openhands.llm.llm import LLM
from openhands.memory.condenser import MemoryCondenser
from openhands.utils.prompt import PromptManager


def save_messages_for_debugging(
    messages: list[Message], summary_action: AgentSummarizeAction
) -> None:
    """
    Serializes the list of Message objects and the summary action,
    then saves them to a JSON file in the ./logs directory for debugging purposes.

    Args:
        messages (list[Message]): The list of messages to serialize.
        summary_action (AgentSummarizeAction): The summary action to append.
    """
    # Ensure the logs directory exists
    log_dir = Path('./logs')
    log_dir.mkdir(parents=True, exist_ok=True)

    # Generate a timestamped filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'debug_summary_{timestamp}.json'
    file_path = log_dir / filename

    try:
        # Serialize messages using Pydantic's model_dump()
        serialized_messages = [message.model_dump() for message in messages]

        # Create a Message instance for the summary_action
        summary_event = Message(
            role='assistant', content=[TextContent(text=str(summary_action))]
        )
        serialized_summary = summary_event.model_dump()

        # Append the serialized summary to the messages
        serialized_messages.append(serialized_summary)

        with file_path.open('w', encoding='utf-8') as f:
            json.dump(serialized_messages, f, ensure_ascii=False, indent=4)

        logger.debug(f'Messages successfully saved to {file_path}')
    except Exception as e:
        logger.error(f'Failed to save messages for debugging: {e}')


def load_swebench_output(file_path: str) -> pd.DataFrame:
    """
    Loads a SWE-bench output.jsonl file into a DataFrame.

    Args:
        file_path: Path to the output.jsonl file
    Returns:
        DataFrame containing the parsed instances
    """
    try:
        # First verify the file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f'File not found: {file_path}')

        # Load the JSONL file
        df = pd.read_json(file_path, lines=True)

        # Print duplicate instance IDs
        duplicates = df['instance_id'].value_counts()
        if any(count > 1 for count in duplicates):
            print('\nWarning: Found duplicate instance IDs:')
            print(duplicates[duplicates > 1])

            # Keep only the first occurrence of each instance_id
            df = df.drop_duplicates(subset=['instance_id'], keep='first')
            print(f'\nKept first occurrence only. Remaining instances: {len(df)}')

        logger.info(f'Loaded {len(df)} instances from {file_path}')

        return df

    except Exception as e:
        logger.error(f'Failed to load output file: {e}')
        raise


def process_instance_history(
    history: list, instance_id: str, llm: LLM
) -> list[Message]:
    """
    Processes a single instance's history into a list of Messages.

    Args:
        history: List of events from the instance history
        instance_id: ID of the instance being processed
    Returns:
        list[Message]: Processed messages ready for condensing
    """
    messages: list[Message] = []
    message_details: list[dict] = []

    first_user_message = True
    for event in history:
        # Events can be either a single event dict or a (legacy) list of [action, observation] pairs
        if isinstance(event, list):
            # Handle action/observation pairs
            for item in event:
                messages.extend(convert_event_to_messages(item, llm))
        else:
            # Handle single events
            new_messages = convert_event_to_messages(event, llm)

            # token counting analysis
            for msg in new_messages:
                msg_dict = msg.model_dump()
                token_count = llm.get_token_count([msg_dict])
                message_details.append(
                    {
                        'event_id': msg.event_id,
                        'role': msg.role,
                        'token_count': token_count,
                        'content_preview': str(msg.content[0].text)[:50] + '...'
                        if msg.content
                        else 'EMPTY',
                    }
                )

            # prepare for condensing:first user message is not condensable
            for msg in new_messages:
                if msg.role == 'user' and first_user_message:
                    msg.condensable = False
                    first_user_message = False
                    break

            # add the message to the list
            messages.extend(new_messages)

    logger.debug(
        f'Converted {len(history)} events into {len(messages)} messages for instance {instance_id}'
    )

    # Find the message with max tokens
    max_msg = max(message_details, key=lambda x: x['token_count'])

    # Create token data with stats
    token_data = {
        'instance_id': instance_id,
        'stats': {
            'max_token_count': max_msg['token_count'],
            'max_token_message': {
                'event_id': max_msg['event_id'],
                'role': max_msg['role'],
                'content_preview': max_msg['content_preview'],
            },
            'total_messages': len(messages),
            'total_tokens': sum(m['token_count'] for m in message_details),
        },
        'messages': message_details,
    }

    # Save token analysis data
    analysis_path = Path('logs/token_analysis')
    analysis_path.mkdir(parents=True, exist_ok=True)
    analysis_file = analysis_path / 'token_analysis.jsonl'

    # Append the data as a new line in the JSONL file
    with open(analysis_file, 'a') as f:
        f.write(json.dumps(token_data) + '\n')

    # Print summary stats
    print('\nToken Count Analysis:')
    print(f"Total messages: {token_data['stats']['total_messages']}")
    print(f"Total tokens: {token_data['stats']['total_tokens']:,}")
    print(f"Max tokens in a message: {token_data['stats']['max_token_count']:,}")

    return messages


def save_instance_for_debugging(instance_data: dict, instance_id: str) -> None:
    """Save the complete instance data to a JSON file for debugging.

    Args:
        instance_data: The complete instance data dictionary
        instance_id: The ID of the instance being saved
    """
    # Ensure the logs directory exists
    log_dir = Path('./logs/debug_instances')
    log_dir.mkdir(parents=True, exist_ok=True)

    # Generate a filename with timestamp and instance_id
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'debug_instance_{instance_id}_{timestamp}.json'
    file_path = log_dir / filename

    try:
        with file_path.open('w', encoding='utf-8') as f:
            json.dump(instance_data, f, ensure_ascii=False, indent=4)
        logger.debug(f'Instance data saved to {file_path}')
    except Exception as e:
        logger.error(f'Failed to save instance data: {e}')


def truncate_and_save_jsonl(file_path: Path) -> Path:
    """Process a JSONL file to truncate oversized observations and save to a new file.

    Args:
        file_path: Path to the original JSONL file

    Returns:
        Path to the new JSONL file with truncated content
    """
    new_file_path = file_path.parent / f'{file_path.stem}.new.jsonl'
    modified_count = 0
    total_events = 0

    # Read and process the file line by line
    with open(file_path, 'r') as f_in, open(new_file_path, 'w') as f_out:
        for line in f_in:
            data = json.loads(line)
            history = data.get('history', [])
            modified = False

            # Process each event in history
            for event_dict in history:
                total_events += 1

                # Check if it's an observation with content
                if 'observation' in event_dict and 'content' in event_dict:
                    original_content = event_dict['content']
                    # Get the truncated version
                    truncated_content = truncate_content(
                        original_content, llm.config.max_message_chars
                    )

                    # If content was truncated, update the event
                    if len(truncated_content) < len(original_content):
                        event_dict['content'] = truncated_content
                        modified = True
                        modified_count += 1

                        # Log the truncation
                        logger.info(
                            f'Truncated observation content from {len(original_content):,} to '
                            f'{len(truncated_content):,} chars'
                        )

            # Write the possibly modified line
            f_out.write(json.dumps(data) + '\n')

    # Log summary
    logger.info(
        f'Processed {total_events:,} events, truncated {modified_count:,} observations'
    )
    logger.info(f'Saved truncated version to: {new_file_path}')

    return new_file_path


def main_with_one_instance(condenser: MemoryCondenser, file_path: str | None = None):
    """Temporary debug version focusing on one instance"""
    if file_path is None:
        print('No file provided')
        return

    llm = condenser.llm

    # First truncate oversized observations and save to new file
    input_path = Path(file_path)
    processed_path = truncate_and_save_jsonl(input_path)

    # Load the processed SWE-bench output file
    df = load_swebench_output(processed_path)
    print(f'Loaded {len(df)} instances from {processed_path}')

    # Find and process only django__django-12983
    target_instance = df[df['instance_id'] == 'django__django-12983'].iloc[0]
    print(f"\nProcessing instance: {target_instance['instance_id']}")

    # Save the complete instance data
    save_instance_for_debugging(
        target_instance.to_dict(), target_instance['instance_id']
    )

    # Convert events to messages
    messages = process_instance_history(
        target_instance['history'], target_instance['instance_id'], llm
    )

    if not messages:
        logger.warning(
            f"No messages generated for instance {target_instance['instance_id']}"
        )
        return

    # Condense the messages and print the full summary
    try:
        summary_action = condenser.condense(messages)
        print('\nFull summary action:')
        print(f'{summary_action}')

        # Save messages and summary for debugging
        if hasattr(condenser, 'save_messages_for_debugging'):
            condenser.save_messages_for_debugging(messages, summary_action)

    except Exception as e:
        logger.error(
            f"Failed to condense messages for instance {target_instance['instance_id']}: {e}"
        )
        raise  # Re-raise to see full traceback


def main(condenser: MemoryCondenser, file_path: str | None = None):
    """
    Main method for quick testing and debugging.
    Reads a specified debug summary JSON file from the ./logs/deepseek-24sept directory,
    deserializes the messages, and prints them.
    If no file is specified, it falls back to the latest file based on timestamp.

    Args:
        file_path (str | None): The path to the log file to process. If None, the latest file is used.
    """
    if file_path is None:
        print('No file provided')
        return

    llm = condenser.llm

    # First truncate oversized observations and save to new file
    input_path = Path(file_path)
    processed_path = truncate_and_save_jsonl(input_path)

    # Load the processed SWE-bench output file
    df = load_swebench_output(processed_path)
    print(f'Loaded {len(df)} instances from {processed_path}')

    # Add history length column
    df['history_length'] = df['history'].apply(len)

    # Get stats
    shortest_idx = df['history_length'].idxmin()
    longest_idx = df['history_length'].idxmax()

    print('\nHistory Length:')
    print(
        f"Shortest history: {df.loc[shortest_idx, 'history_length']} events (instance: {df.loc[shortest_idx, 'instance_id']})"
    )
    print(
        f"Longest history: {df.loc[longest_idx, 'history_length']} events (instance: {df.loc[longest_idx, 'instance_id']})"
    )
    print(f"Average length: {df['history_length'].mean():.1f} events")

    # History Length:
    # Shortest history: 16 events (instance: django__django-12983)
    # Longest history: 202 events (instance: django__django-11422)
    # Average length: 53.8 events

    # Process each instance's history
    for _, row in df.iterrows():
        if 'history' not in row:
            print(f"No history found for instance {row['instance_id']}")
            continue

        # Convert events to messages
        messages = process_instance_history(row['history'], row['instance_id'], llm)

        if not messages:
            logger.warning(f"No messages generated for instance {row['instance_id']}")
            continue

        # Condense the messages
        # try:
        #    summary_action = condenser.condense(messages)
        #    logger.info(f"Summary for instance {row['instance_id']}:")
        #    logger.info(f'{summary_action}')

        #    # Save messages and summary for debugging if needed
        #    if hasattr(condenser, 'save_messages_for_debugging'):
        #        condenser.save_messages_for_debugging(messages, summary_action)

        # except Exception as e:
        #    logger.error(
        #        f"Failed to condense messages for instance {row['instance_id']}: {e}"
        #    )


if __name__ == '__main__':
    # load or simulate dependencies as needed for testing
    app_config = load_app_config()

    prompt_dir = os.path.join(
        os.path.dirname(openhands.__file__),
        'agenthub',
        'codeact_agent',
        'prompts',
    )
    print(f'prompt_dir: {prompt_dir}')
    prompt_manager = PromptManager(prompt_dir=prompt_dir)

    # Setup argument parser for optional file parameter
    parser = argparse.ArgumentParser(
        description='Run MemoryCondenser on a .jsonl file.'
    )
    parser.add_argument(
        '--file',
        type=str,
        default=None,
        help='Path to the specific file to process. If not provided, the latest file is used.',
    )
    parser.add_argument(
        '-l',
        '--llm_config',
        type=str,
        default=None,
        help='LLM config to use, as defined in the config.toml file. If not provided, the fallback is used.',
    )
    args = parser.parse_args()

    # .jsonl file to work on
    if args.file is not None and args.file == '':
        args.file = None

    if not args.file:
        print(
            'No file provided, using latest file in ./logs/claude-3-5-sonnet-20241022_maxiter_100_N_v2.2-no-hint'
        )
        args.file = (
            './logs/claude-3-5-sonnet-20241022_maxiter_100_N_v2.2-no-hint/output.jsonl'
        )

    # load the LLM config
    if args.llm_config is not None:
        llm_config = get_llm_config_arg(args.llm_config)
    else:
        llm_config = app_config.get_llm_config('llm')

    llm = LLM(config=llm_config)

    condenser = MemoryCondenser(llm=llm, prompt_manager=prompt_manager)

    # attach on fly the save_messages_for_debugging method to the condenser
    condenser.save_messages_for_debugging = save_messages_for_debugging

    # attach the llm_anthropic_token_counter method to the LLM class
    from functools import partial

    llm.get_token_count = partial(llm_anthropic_token_counter, llm)

    # Call the main method with the specified file path
    main_with_one_instance(condenser, file_path=args.file)
