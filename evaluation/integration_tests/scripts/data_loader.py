import json
from dataclasses import dataclass, field
from pathlib import Path

from litellm import Usage

from openhands.core.message import ImageContent, Message, TextContent
from openhands.events.action import (
    Action,
    AgentDelegateAction,
    AgentFinishAction,
    BrowseInteractiveAction,
    BrowseURLAction,
    CmdRunAction,
    FileEditAction,
    IPythonRunCellAction,
    MessageAction,
)
from openhands.events.observation import (
    AgentDelegateObservation,
    BrowserOutputObservation,
    CmdOutputObservation,
    ErrorObservation,
    FileEditObservation,
    IPythonRunCellObservation,
    Observation,
    UserRejectObservation,
)
from openhands.events.serialization.action import action_from_dict
from openhands.events.serialization.observation import observation_from_dict


@dataclass
class Message:
    """Represents a single message in a conversation."""

    role: str
    content: str
    tool_calls: list[dict] | None = None
    function_call: dict | None = None


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
class Completion:
    """Represents a complete interaction including messages and response."""

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

    def get_messages_from_events(self, events: list[dict]) -> list[Message]:
        """Convert a list of events into a list of Messages following CodeActAgent logic.

        Args:
            events: List of event dictionaries from history

        Returns:
            List of Messages converted from the events
        """
        messages: list[Message] = []
        pending_tool_call_action_messages: dict[str, Message] = {}
        tool_call_id_to_message: dict[str, Message] = {}

        for event_dict in events:
            # Convert dict to appropriate Event type using serialization logic
            try:
                if 'action' in event_dict:
                    event = action_from_dict(event_dict)
                elif 'observation' in event_dict:
                    event = observation_from_dict(event_dict)
                else:
                    continue  # Skip unknown event types
            except Exception:
                continue  # Skip events that fail to deserialize

            # Convert Event to Message(s) following CodeActAgent logic
            messages_to_add: list[Message] = []
            if isinstance(event, Action):
                if isinstance(
                    event,
                    (
                        AgentDelegateAction,
                        IPythonRunCellAction,
                        FileEditAction,
                        BrowseInteractiveAction,
                        BrowseURLAction,
                    ),
                ) or (
                    isinstance(event, (AgentFinishAction, CmdRunAction))
                    and event.source == 'agent'
                ):
                    # Handle tool call metadata if present
                    if event.tool_call_metadata:
                        llm_response = event.tool_call_metadata.model_response
                        assistant_msg = llm_response.choices[0].message
                        pending_tool_call_action_messages[llm_response.id] = Message(
                            role=assistant_msg.role,
                            content=[TextContent(text=assistant_msg.content or '')],
                            tool_calls=assistant_msg.tool_calls,
                        )
                elif isinstance(event, MessageAction):
                    role = 'user' if event.source == 'user' else 'assistant'
                    content = [TextContent(text=event.content or '')]
                    if event.image_urls:
                        content.append(ImageContent(image_urls=event.image_urls))
                    messages_to_add.append(Message(role=role, content=content))
                elif isinstance(event, CmdRunAction) and event.source == 'user':
                    content = [
                        TextContent(text=f'User executed the command:\n{event.command}')
                    ]
                    messages_to_add.append(Message(role='user', content=content))

            elif isinstance(event, Observation):
                if isinstance(event, CmdOutputObservation):
                    if event.tool_call_metadata is None:
                        text = f'\nObserved result of command executed by user:\n{event.content}'
                    else:
                        text = event.content + event.interpreter_details
                    text += f'\n[Command finished with exit code {event.exit_code}]'
                    message = Message(role='user', content=[TextContent(text=text)])
                elif isinstance(event, IPythonRunCellObservation):
                    # Replace base64 images with placeholder
                    text = event.content
                    splitted = text.split('\n')
                    for i, line in enumerate(splitted):
                        if '![image](data:image/png;base64,' in line:
                            splitted[i] = (
                                '![image](data:image/png;base64, ...) already displayed to user'
                            )
                    text = '\n'.join(splitted)
                    message = Message(role='user', content=[TextContent(text=text)])
                elif isinstance(event, FileEditObservation):
                    message = Message(
                        role='user', content=[TextContent(text=str(event))]
                    )
                elif isinstance(event, BrowserOutputObservation):
                    text = event.get_agent_obs_text()
                    message = Message(role='user', content=[TextContent(text=text)])
                elif isinstance(event, AgentDelegateObservation):
                    text = event.outputs.get('content', '') if event.outputs else ''
                    message = Message(role='user', content=[TextContent(text=text)])
                elif isinstance(event, ErrorObservation):
                    text = (
                        event.content + '\n[Error occurred in processing last action]'
                    )
                    message = Message(role='user', content=[TextContent(text=text)])
                elif isinstance(event, UserRejectObservation):
                    text = (
                        'OBSERVATION:\n'
                        + event.content
                        + '\n[Last action has been rejected by the user]'
                    )
                    message = Message(role='user', content=[TextContent(text=text)])
                else:
                    continue

                # Handle tool call metadata for observations
                if event.tool_call_metadata:
                    tool_call_id_to_message[event.tool_call_metadata.tool_call_id] = (
                        Message(
                            role='tool',
                            content=message.content,
                            tool_call_id=event.tool_call_metadata.tool_call_id,
                            name=event.tool_call_metadata.function_name,
                        )
                    )
                    continue  # Skip adding to messages_to_add
                messages_to_add.append(message)

            # Process any complete tool call sequences
            response_ids_to_remove = []
            for (
                response_id,
                pending_message,
            ) in pending_tool_call_action_messages.items():
                if pending_message.tool_calls and all(
                    tool_call.id in tool_call_id_to_message
                    for tool_call in pending_message.tool_calls
                ):
                    # Add the initiating message
                    messages_to_add.append(pending_message)
                    # Add all tool responses
                    for tool_call in pending_message.tool_calls:
                        messages_to_add.append(tool_call_id_to_message[tool_call.id])
                        tool_call_id_to_message.pop(tool_call.id)
                    response_ids_to_remove.append(response_id)

            # Cleanup processed tool calls
            for response_id in response_ids_to_remove:
                pending_tool_call_action_messages.pop(response_id)

            # Add messages while handling consecutive same-role messages
            for message in messages_to_add:
                if (
                    messages
                    and messages[-1].role == message.role
                    and message.role != 'tool'
                ):
                    messages[-1].content.extend(message.content)
                else:
                    messages.append(message)

        return messages


# TestResult dict:
# - git_patch
# - resolved
# - test_timeout
# - test_errored
# - applied


@dataclass
class EvalInstance:
    """Represents a single evaluation instance with its complete data."""

    instance_id: str
    instruction: str
    instance: dict
    metadata: dict
    test_result: dict | None = None
    history: list[list[dict]] = field(default_factory=list)
    llm_completions: list[Completion] = field(default_factory=list)
    fine_grained_report: dict | None = None
    report: dict | None = None


class DataLoader:
    """Handles loading and processing of evaluation JSONL files."""

    @staticmethod
    def load_jsonl(file_path: Path) -> tuple[list[EvalInstance], list[EvalInstance]]:
        """
        Load and parse a JSONL file containing evaluation data.

        Args:
            file_path: Path to the JSONL file

        Returns:
            Tuple of (normal instances, instances that got stuck in loops)
        """
        eval_instances: list[EvalInstance] = []
        stuck_in_loop: list[EvalInstance] = []

        printed_first_line = False

        with open(file_path, 'r') as f:
            for line in f:
                data = json.loads(line)

                if not printed_first_line:
                    print(data)
                    printed_first_line = True

                # Convert raw completion data to Completion objects
                llm_completions = [
                    Completion(
                        messages=[Message(**msg) for msg in comp.get('messages', [])],
                        response=Response(**comp.get('response', {})),
                    )
                    for comp in data.get('llm_completions', [])
                ]

                # if we don't have any llm completions, convert history to messages
                if not llm_completions:
                    llm_completions = Completion().get_messages_from_events(
                        data.get('history', [])
                    )

                instance = EvalInstance(
                    instance_id=data.get('instance_id', ''),
                    instruction=data.get('instruction', ''),
                    instance=data.get('instance', {}),
                    test_result=data.get('test_result'),
                    metadata=data.get('metadata', {}),
                    history=data.get('history', []),
                    llm_completions=llm_completions,
                )

                # Check if instance got stuck in a loop
                if (
                    instance.test_result
                    and 'Agent got stuck in a loop'
                    in instance.test_result.get('error', '')
                ):
                    stuck_in_loop.append(instance)
                else:
                    eval_instances.append(instance)

        return eval_instances, stuck_in_loop

    @staticmethod
    def load_directory(
        directory: Path, pattern: str = '*.jsonl'
    ) -> tuple[list[EvalInstance], list[EvalInstance]]:
        """
        Load all JSONL files in a directory matching the given pattern.

        Args:
            directory: Directory path to search
            pattern: Glob pattern for files to load (default: "*.jsonl")

        Returns:
            Tuple of (all normal instances, all instances that got stuck in loops)
        """
        all_instances: list[EvalInstance] = []
        all_stuck: list[EvalInstance] = []

        for file_path in directory.glob(pattern):
            instances, stuck = DataLoader.load_jsonl(file_path)
            all_instances.extend(instances)
            all_stuck.extend(stuck)

        return all_instances, all_stuck


# run on the output jsonl
if __name__ == '__main__':
    from pathlib import Path

    # Load a single file
    instances, stuck = DataLoader.load_jsonl(
        Path(
            '../evals/outputs/swe_bench_lite/CodeActAgent/claude-3-5-sonnet-20241022_maxiter_100_N_v2.2-no-hint/output.jsonl'
        )
    )

    # Or load all JSONL files in a directory
    # instances, stuck = DataLoader.load_directory(Path("../evals/outputs/swe_bench_lite/CodeActAgent/claude-3-5-sonnet-20241022_maxiter_100_N_v2.2-no-hint/"))

    # Access the data
    for instance in instances:
        # Get system/user prompts
        for completion in instance.llm_completions:
            system_prompt = completion.system_prompt
            user_messages = completion.user_messages

    print(len(instances), len(stuck))
