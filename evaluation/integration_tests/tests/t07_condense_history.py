import argparse
import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd

import openhands
import openhands.agenthub  # noqa F401 (we import this to get the agents registered)
from openhands.core.config.utils import get_llm_config_arg, load_app_config
from openhands.core.logger import openhands_logger as logger
from openhands.core.message import ImageContent, Message, TextContent
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
from openhands.events.serialization.event import event_from_dict
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
        return [Message(role=role, content=[TextContent(text=event.content)])]
    elif isinstance(event, CmdRunAction):
        if event.source == EventSource.USER:
            return [
                Message(
                    role='user',
                    content=[TextContent(text=f'User executed: $ {event.command}')],
                )
            ]
        # For agent commands, get the original LLM response with reasoning
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                )
            ]
        # Fallback if no tool metadata
        return [
            Message(
                role='assistant',
                content=[TextContent(text=f'$ {event.command}')],
            )
        ]
    elif isinstance(event, IPythonRunCellAction):
        if event.source == EventSource.USER:
            return [
                Message(
                    role='user',
                    content=[TextContent(text=f'```python\n{event.code}\n```')],
                )
            ]
        # For agent Python code, get original LLM response
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                )
            ]
        return [
            Message(
                role='assistant',
                content=[TextContent(text=f'```python\n{event.code}\n```')],
            )
        ]
    elif isinstance(event, FileEditAction):
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                )
            ]
        content = f'Edit file {event.file_path}\n```\n{event.content}\n```'
        return [Message(role='assistant', content=[TextContent(text=content)])]
    elif isinstance(event, (BrowseInteractiveAction, BrowseURLAction)):
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                )
            ]
        return [
            Message(
                role='assistant',
                content=[TextContent(text=f'Browse: {event.url}')],
            )
        ]
    elif isinstance(event, AgentDelegateAction):
        if event.tool_call_metadata and event.tool_call_metadata.model_response:
            assistant_msg = event.tool_call_metadata.model_response.choices[0].message
            return [
                Message(
                    role='assistant',
                    content=[TextContent(text=assistant_msg.content or '')],
                    tool_calls=assistant_msg.tool_calls,
                )
            ]
        return [
            Message(
                role='assistant',
                content=[TextContent(text=f'Delegate to agent: {event.agent}')],
            )
        ]
    elif isinstance(event, AgentFinishAction):
        role = 'user' if event.source == EventSource.USER else 'assistant'
        return [Message(role=role, content=[TextContent(text=event.content)])]

    # Handle observations (tool results)
    if isinstance(event, CmdOutputObservation):
        content = f'Command output (exit code {event.exit_code}):\n{event.output}'
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=content)],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                )
            ]
        return [Message(role='user', content=[TextContent(text=content)])]
    elif isinstance(event, IPythonRunCellObservation):
        content = []
        if event.output:
            content.append(TextContent(text=f'Output:\n{event.output}'))
        if event.error:
            content.append(TextContent(text=f'Error:\n{event.error}'))
        if event.images:
            content.append(ImageContent(image_urls=event.images))
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=content,
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                )
            ]
        return [Message(role='user', content=content)]
    elif isinstance(event, FileEditObservation):
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=f'File edited: {event.file_path}')],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=f'File edited: {event.file_path}')],
            )
        ]
    elif isinstance(event, BrowserOutputObservation):
        content = event.content
        if isinstance(content, dict):
            content = json.dumps(content, indent=2)
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=f'Browser output:\n{content}')],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=f'Browser output:\n{content}')],
            )
        ]
    elif isinstance(event, AgentDelegateObservation):
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=f'Delegate result: {event.content}')],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=f'Delegate result: {event.content}')],
            )
        ]
    elif isinstance(event, ErrorObservation):
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=[TextContent(text=f'Error: {event.error}')],
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                )
            ]
        return [
            Message(
                role='user',
                content=[TextContent(text=f'Error: {event.error}')],
            )
        ]
    elif isinstance(event, UserRejectObservation):
        return [
            Message(
                role='user',
                content=[TextContent(text=event.content)],
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

        # Convert events to messages
        messages = process_instance_history(row['history'], row['instance_id'])

        if not messages:
            logger.warning(f"No messages generated for instance {row['instance_id']}")
            continue

        # Condense the messages
        try:
            summary_action = condenser.condense(messages)
            logger.info(f"Summary for instance {row['instance_id']}:")
            logger.info(f'{summary_action}')

            # Save messages and summary for debugging if needed
            if hasattr(condenser, 'save_messages_for_debugging'):
                condenser.save_messages_for_debugging(messages, summary_action)

        except Exception as e:
            logger.error(
                f"Failed to condense messages for instance {row['instance_id']}: {e}"
            )


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

        # Read the file line by line to handle potential JSON parsing errors
        records = []
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    if line.strip():  # Skip empty lines
                        record = json.loads(line)
                        records.append(record)
                except json.JSONDecodeError as e:
                    logger.warning(f'Failed to parse line {line_num}: {e}')
                    continue

        if not records:
            raise ValueError('No valid records found in file')

        df = pd.DataFrame.from_records(records)
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

    for event in history:
        # Events can be either a single event dict or a (legacy) list of [action, observation] pairs
        if isinstance(event, list):
            # Handle action/observation pairs
            for item in event:
                messages.extend(convert_event_to_messages(item))
        else:
            # Handle single events
            messages.extend(convert_event_to_messages(event))

    logger.debug(
        f'Converted {len(history)} events into {len(messages)} messages for instance {instance_id}'
    )
    return messages


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
