import argparse
import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd

import openhands
import openhands.agenthub  # noqa F401 (we import this to get the agents registered)
from evaluation.integration_tests.utils import llm_anthropic_token_counter
from openhands.core.config.utils import get_llm_config_arg, load_app_config
from openhands.core.logger import openhands_logger as logger
from openhands.core.message import Message, TextContent
from openhands.events.action import (
    AgentDelegateAction,
    AgentFinishAction,
    BrowseInteractiveAction,
    BrowseURLAction,
    CmdRunAction,
    FileEditAction,
    IPythonRunCellAction,
    MessageAction,
)
from openhands.events.action.agent import AgentSummarizeAction
from openhands.events.event import EventSource
from openhands.events.observation.browse import BrowserOutputObservation
from openhands.events.observation.commands import (
    CmdOutputObservation,
    IPythonRunCellObservation,
)
from openhands.events.observation.delegate import AgentDelegateObservation
from openhands.events.observation.error import ErrorObservation
from openhands.events.observation.files import FileEditObservation
from openhands.events.observation.reject import UserRejectObservation
from openhands.events.serialization.event import event_from_dict, truncate_content
from openhands.llm.llm import LLM
from openhands.memory.condenser import MemoryCondenser
from openhands.utils.prompt import PromptManager


def convert_event_to_messages(event_dict: dict) -> list[Message]:
    """
    Converts a single event dictionary into one or more Message objects.

    Args:
        event_dict: Dictionary containing event data
    Returns:
        list[Message]: List of converted messages (usually one, but might be more for tool calls)
    """
    # First deserialize the event into its proper type
    event = event_from_dict(event_dict)

    # Handle actions
    if isinstance(event, MessageAction):
        role = 'user' if event.source == EventSource.USER else 'assistant'

        # the MessageAction never has tool metadata
        return [
            Message(
                role=role,
                content=[TextContent(text=event.content)],
                event_id=event.id,
            )
        ]
    elif isinstance(event, CmdRunAction):
        # for user commands, just return
        if event.source == EventSource.USER:
            return [
                Message(
                    role='user',
                    content=[TextContent(text=f'User executed: $ {event.command}')],
                    event_id=event.id,
                )
            ]

        # for agent commands, it's a tool call, get the original LLM response with reasoning
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                    event_id=event.id,
                )
            ]
        # no tool metadata should never happen for agent commands
        logger.warning(
            f'No tool metadata for agent command: {event.id} - {type(event)} - {event.command[:30]}'
        )
        return []
    elif isinstance(event, IPythonRunCellAction):
        # for user Python code, just return
        if event.source == EventSource.USER:
            return [
                Message(
                    role='user',
                    content=[TextContent(text=f'```python\n{event.code}\n```')],
                    event_id=event.id,
                )
            ]
        # for agent Python code, it's a tool call, get the original LLM response
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                    event_id=event.id,
                )
            ]
        # no tool metadata should never happen for agent Python code
        logger.warning(
            f'No tool metadata for agent Python code: {event.id} - {type(event)} - {event.code[:30]}'
        )
        return []
    elif isinstance(event, FileEditAction):
        # agent-only, it's a tool call
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                    event_id=event.id,
                )
            ]
        # no tool metadata should never happen for file edit
        logger.warning(
            f'No tool metadata for file edit: {event.id} - {type(event)} - {event.file_path}'
        )
        return []
    elif isinstance(event, (BrowseInteractiveAction, BrowseURLAction)):
        # agent-only, it's a tool call
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                    event_id=event.id,
                )
            ]
        # no tool metadata should never happen for agent browse
        logger.warning(
            f'No tool metadata for agent browse: {event.id} - {type(event)} - {event.url}'
        )
        return []
    elif isinstance(event, AgentDelegateAction):
        # agent-only, it's a tool call
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                    event_id=event.id,
                )
            ]
        # no tool metadata should never happen for agent delegate
        logger.warning(
            f'No tool metadata for agent delegate: {event.id} - {type(event)} - {event.agent}'
        )
        return []
    elif isinstance(event, AgentFinishAction):
        # no tool metadata is necessary for the finish action
        role = 'user' if event.source == EventSource.USER else 'assistant'
        return [
            Message(
                role=role,
                content=[TextContent(text=event.thought)],
                event_id=event.id,
            )
        ]

    # Handle observations (tool results)
    if isinstance(event, CmdOutputObservation):
        # Add interpreter details and truncate content
        content = truncate_content(
            event.content + event.interpreter_details, llm.config.max_message_chars
        )
        content += f'\n[Command finished with exit code {event.exit_code}]'

        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=content)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]
        return [Message(role='user', content=[TextContent(text=content)])]
    elif isinstance(event, IPythonRunCellObservation):
        # replace base64 images with a placeholder
        text = event.content
        splitted = text.split('\n')
        for i, line in enumerate(splitted):
            if '![image](data:image/png;base64,' in line:
                splitted[i] = (
                    '![image](data:image/png;base64, ...) already displayed to user'
                )
        text = '\n'.join(splitted)

        # NOTE: we truncate content here, including the image data!
        text = truncate_content(text, llm.config.max_message_chars)

        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=text)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]
        return [Message(role='user', content=[TextContent(text=text)])]
    elif isinstance(event, FileEditObservation):
        text = truncate_content(str(event), llm.config.max_message_chars)
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=text)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=text)],
                event_id=event.id,
            )
        ]
    elif isinstance(event, BrowserOutputObservation):
        text = event.get_agent_obs_text()
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=text)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=text)],
                event_id=event.id,
            )
        ]
    elif isinstance(event, AgentDelegateObservation):
        content = truncate_content(
            f'Delegate result: {event.content}', llm.config.max_message_chars
        )
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=content)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=content)],
                event_id=event.id,
            )
        ]
    elif isinstance(event, ErrorObservation):
        content = truncate_content(
            f'Error: {event.content}', llm.config.max_message_chars
        )
        content += '\n[Error occurred in processing last action]'
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=content)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=content)],
                event_id=event.id,
            )
        ]
    elif isinstance(event, UserRejectObservation):
        content = 'OBSERVATION:\n' + truncate_content(
            event.content, llm.config.max_message_chars
        )
        content += '\n[Last action has been rejected by the user]'
        return [
            Message(
                role='user',
                content=[TextContent(text=content)],
                event_id=event.id,
            )
        ]

    logger.warning(f'Unhandled event type: {type(event)}')
    return []


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


def process_instance_history(history: list, instance_id: str) -> list[Message]:
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

    logger.debug(
        f'Converting {len(history)} events into messages for instance {instance_id}'
    )

    first_user_message = True
    for event in history:
        # Events can be either a single event dict or a (legacy) list of [action, observation] pairs
        if isinstance(event, list):
            # Handle action/observation pairs
            for item in event:
                messages.extend(convert_event_to_messages(item))
        else:
            # Handle single events
            new_messages = convert_event_to_messages(event)

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


def main_with_one_instance(condenser: MemoryCondenser, file_path: str | None = None):
    """Temporary debug version focusing on one instance"""
    if file_path is None:
        print('No file provided')
        return

    # Load the SWE-bench output file
    df = load_swebench_output(file_path)
    print(f'Loaded {len(df)} instances from {file_path}')

    # Find and process only django__django-12983
    target_instance = df[df['instance_id'] == 'django__django-12983'].iloc[0]
    print(f"\nProcessing instance: {target_instance['instance_id']}")

    # Save the complete instance data
    save_instance_for_debugging(
        target_instance.to_dict(), target_instance['instance_id']
    )

    # Convert events to messages
    messages = process_instance_history(
        target_instance['history'], target_instance['instance_id']
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

    # Load the SWE-bench output file
    df = load_swebench_output(file_path)
    print(f'Loaded {len(df)} instances from {file_path}')

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
        messages = process_instance_history(row['history'], row['instance_id'])

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
    main(condenser, file_path=args.file)
