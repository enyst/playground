import argparse
import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd

import openhands
import openhands.agenthub  # noqa F401 (we import this to get the agents registered)
from openhands.core import logger
from openhands.core.config.utils import get_llm_config_arg, load_app_config
from openhands.core.message import Message, TextContent
from openhands.events.action.agent import AgentSummarizeAction
from openhands.events.serialization.event import event_from_dict
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

    # Process each instance's history
    for _, row in df.iterrows():
        if 'history' in row:
            process_instance_history(row['history'], row['instance_id'])
        else:
            print(f"No history found for instance {row['instance_id']}")

    # use openhands's __file__ to get the project root directory
    log_dir = Path(
        os.path.dirname(openhands.__file__),
        '..',
        'logs',
        'claude-3-5-sonnet-20241022_maxiter_100_N_v2.2-no-hint',
    )
    log_dir.mkdir(parents=True, exist_ok=True)

    if file_path:
        target_log = Path(file_path)
        if not target_log.exists():
            print(f'Specified log file does not exist: {target_log}')
            return
    else:
        log_files = list(log_dir.glob('instance_*_*.json'))

        if not log_files:
            print(
                'No instance_*_*.json files found in the ./logs/claude-3-5-sonnet-20241022_maxiter_100_N_v2.2-no-hint directory.'
            )
            return

        # Sort files to find the latest one based on the digits at the end of the filename
        def extract_digits(file_path: Path) -> int:
            try:
                # Extract the digits part from the filename
                digits_str = file_path.stem.split('_')[-1]
                return int(digits_str)
            except (IndexError, ValueError):
                # If digit extraction fails, assign the lowest possible value
                return -1

        log_files.sort(key=extract_digits, reverse=True)
        target_log = log_files[0]

        print(f'Loading messages from: {target_log}')

    try:
        with target_log.open('r', encoding='utf-8') as f:
            messages_data = json.load(f)

            # convert string content to list of TextContent if necessary
            for msg in messages_data:
                if isinstance(msg['content'], str):
                    msg['content'] = [{'type': 'text', 'text': msg['content']}]

            messages: list[Message] = [
                Message.model_validate(msg, strict=False) for msg in messages_data
            ]

            print(f'Successfully loaded {len(messages)} messages:')
            # for msg in messages:
            #    print(f'{msg.role}:\n {msg.content[50:]}')

            # run condense on these messages
            summary_action = condenser.condense(messages)
            print(f'summary_action: {summary_action}')

            # save the summary action to a file named with the same name as the log file + summary
            summary_file_path = target_log.with_suffix('.summary.json')
            with summary_file_path.open('w', encoding='utf-8') as f:
                json.dump(summary_action.model_dump(), f, ensure_ascii=False, indent=4)

    except Exception as e:
        print(f'An error occurred while reading {target_log}: {e}')
        return


def load_swebench_output(file_path: str) -> pd.DataFrame:
    """
    Loads a SWE-bench output.jsonl file into a DataFrame.

    Args:
        file_path: Path to the output.jsonl file
    Returns:
        DataFrame containing the parsed instances
    """
    try:
        df = pd.read_json(file_path, lines=True)
        logger.info(f'Loaded {len(df)} instances from {file_path}')
        return df
    except Exception as e:
        logger.error(f'Failed to load output file: {e}')
        raise


def process_instance_history(history: list, instance_id: str) -> None:
    """
    Processes the history of events for a single instance.

    Args:
        history: List of events from the instance history
        instance_id: ID of the instance being processed
    """
    logger.info(f'\nProcessing history for instance {instance_id}')
    logger.info('=' * 80)

    for i, event in enumerate(history):
        # Events can be either:
        # 1. A single event dict
        # 2. A list of [action, observation] pairs (legacy format)
        if isinstance(event, list):
            # Legacy format with action/observation pairs
            action = event_from_dict(event[0])
            observation = event_from_dict(event[1])
            logger.info(f'\nEvent {i+1}:')
            logger.info(f'Action: {action.__class__.__name__}')
            logger.info(f'{action}')
            logger.info(f'Observation: {observation.__class__.__name__}')
            logger.info(f'{observation}')
        else:
            # Single event
            event_obj = event_from_dict(event)
            logger.info(f'\nEvent {i+1}: {event_obj.__class__.__name__}')
            logger.info(f'{event_obj}')


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

    llm_config = get_llm_config_arg(args.llm_config)
    if llm_config is not None:
        llm = LLM(config=llm_config)
    else:
        llm = LLM(app_config.get_llm_config('llm'))

    condenser = MemoryCondenser(llm=llm, prompt_manager=prompt_manager)

    # attach on fly the save_messages_for_debugging method to the condenser
    condenser.save_messages_for_debugging = save_messages_for_debugging

    # Call the main method with the specified file path
    main(condenser, file_path=args.file)
