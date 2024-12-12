import json
from dataclasses import dataclass, field
from pathlib import Path

from litellm import Usage

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
from openhands.events.event import EventSource
from openhands.events.observation.browse import BrowserOutputObservation
from openhands.events.observation.commands import (
    CmdOutputObservation,
    IPythonRunCellObservation,
)
from openhands.events.observation.delegate import AgentDelegateObservation
from openhands.events.observation.error import ErrorObservation
from openhands.events.observation.files import FileEditObservation
from openhands.events.observation.observation import Observation
from openhands.events.observation.reject import UserRejectObservation
from openhands.events.serialization.event import event_from_dict, truncate_content
from openhands.llm import llm


@dataclass
class Response:
    """Represents an LLM API response."""

    id: str
    choices: list[dict]  # finish_reason, 'index', 'message'
    created: int
    model: str
    object: str
    system_fingerprint: str | None
    usage: Usage  # prompt_tokens, completion_tokens, total_tokens
    service_tier: str | None = None

    @property
    def message(self) -> Message:
        return self.choices[0]['message']


@dataclass
class MessageThread:
    """Represents a complete LLM turn (completion call) including messages and response."""

    messages: list[Message] = field(default_factory=list)
    response: Response | None = None
    timestamp: int | None = None
    cost: float | None = None

    @property
    def system_prompt(self) -> str | None:
        """Get the system prompt if it exists."""
        for message in self.messages:
            if message.role == 'system':
                return message.content
        return None

    @property
    def user_messages(self) -> list[Message]:
        """Get all user messages."""
        return [message for message in self.messages if message.role == 'user']

    @property
    def first_user_message(self) -> Message | None:
        """Get the first user message if it exists."""
        for message in self.messages:
            if message.role == 'user':
                return message
        return None


def convert_event_to_messages(event_dict: dict, llm: llm.LLM) -> list[Message]:
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
    if isinstance(event, Observation):
        # create the base message that will be based on observation type
        message: Message | None = None

        if isinstance(event, CmdOutputObservation):
            # Add interpreter details and truncate content
            content = truncate_content(
                event.content + event.interpreter_details, llm.config.max_message_chars
            )
            content += f'\n[Command finished with exit code {event.exit_code}]'
            message = Message(role='user', content=[TextContent(text=content)])

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
            text = truncate_content(text, llm.config.max_message_chars)
            message = Message(role='user', content=[TextContent(text=text)])

        elif isinstance(event, FileEditObservation):
            text = truncate_content(str(event), llm.config.max_message_chars)
            message = Message(role='user', content=[TextContent(text=text)])

        elif isinstance(event, BrowserOutputObservation):
            text = event.get_agent_obs_text()
            message = Message(role='user', content=[TextContent(text=text)])

        elif isinstance(event, AgentDelegateObservation):
            content = truncate_content(
                f'Delegate result: {event.content}', llm.config.max_message_chars
            )
            message = Message(role='user', content=[TextContent(text=content)])

        elif isinstance(event, ErrorObservation):
            content = truncate_content(
                f'Error: {event.content}', llm.config.max_message_chars
            )
            content += '\n[Error occurred in processing last action]'
            message = Message(role='user', content=[TextContent(text=content)])

        elif isinstance(event, UserRejectObservation):
            content = 'OBSERVATION:\n' + truncate_content(
                event.content, llm.config.max_message_chars
            )
            content += '\n[Last action has been rejected by the user]'
            message = Message(role='user', content=[TextContent(text=content)])

        if message is None:
            logger.warning(f'Unhandled observation type: {type(event)}')
            return []

        # Now handle tool metadata if present
        if event.tool_call_metadata:
            return [
                Message(
                    role='tool',
                    content=message.content,
                    tool_call_id=event.tool_call_metadata.tool_call_id,
                    name=event.tool_call_metadata.function_name,
                    event_id=event.id,
                )
            ]

        # Add event_id to the base message
        message.event_id = event.id
        return [message]

    logger.warning(f'Unhandled event type: {type(event)}')
    return []


class MessageLoader:
    """Handles loading and processing of evaluation JSONL files."""

    @staticmethod
    def load_jsonl(file_path: Path) -> tuple[list[dict], list[dict]]:
        """Load and parse a JSONL file containing evaluation data.

        Returns:
            Tuple of (normal instances, instances that got stuck in loops)
        """
        instances: list[dict] = []
        stuck_in_loop: list[dict] = []

        with open(file_path, 'r') as f:
            for line in f:
                data = json.loads(line)

                # NOTE: new version, when completion data is stored on the filesystem in .json files
                # in the file, log_completions_folder has the folder
                log_completions_folder = Path(data.get('log_completions_folder', ''))
                if log_completions_folder.exists():
                    message_threads = MessageLoader.load_log_completions(
                        log_completions_folder
                    )

                instance_data = {
                    'instance_id': data.get('instance_id', ''),
                    'instruction': data.get('instruction', ''),
                    'instance': data.get('instance', {}),
                    'metadata': data.get('metadata', {}),
                    'test_result': data.get('test_result'),
                    'history': data.get('history', []),  # event history
                    'message_threads': message_threads,  # LLM completions
                }

                # Check if instance got stuck in a loop
                if instance_data[
                    'test_result'
                ] and 'Agent got stuck in a loop' in instance_data['test_result'].get(
                    'error', ''
                ):
                    stuck_in_loop.append(instance_data)
                else:
                    instances.append(instance_data)

        return instances, stuck_in_loop

    @staticmethod
    def load_directory(
        directory: Path, pattern: str = '*.jsonl'
    ) -> tuple[list[dict], list[dict]]:
        """Load all JSONL files in a directory matching pattern."""
        all_instances: list[dict] = []
        all_stuck: list[dict] = []

        for file_path in directory.glob(pattern):
            instances, stuck = MessageLoader.load_jsonl(file_path)
            all_instances.extend(instances)
            all_stuck.extend(stuck)

        return all_instances, all_stuck

    @staticmethod
    def load_llm_completions(data: dict) -> list[MessageThread]:
        """
        Load completion data from the jsonl dictionary.
        NOTE: old version, when completion data was stored in the file
        """
        # Convert raw completion data to MessageThread objects
        if 'llm_completions' in data:
            message_threads = [
                MessageThread(
                    messages=[Message(**msg) for msg in comp.get('messages', [])],
                    response=Response(**comp.get('response', {}))
                    if comp.get('response')
                    else None,
                    timestamp=comp.get('timestamp'),
                    cost=comp.get('cost'),
                )
                for comp in data.get('llm_completions', [])
            ]
        return message_threads
