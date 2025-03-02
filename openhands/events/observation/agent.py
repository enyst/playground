from dataclasses import dataclass, field
from enum import Enum

from openhands.core.schema import ObservationType
from openhands.events.observation.observation import Observation


class RecallType(Enum):
    """The type of information that can be recalled."""

    ENVIRONMENT_INFO = 'environment_info'
    """environment information (repo instructions, runtime, etc.)"""

    KNOWLEDGE_MICROAGENT = 'knowledge_microagent'
    """A knowledge microagent."""

    MICROAGENT_KNOWLEDGE = 'microagent_knowledge'
    """Alias for KNOWLEDGE_MICROAGENT for backward compatibility."""

    DEFAULT = 'default'
    """Anything else that doesn't fit into the other categories."""


@dataclass
class AgentStateChangedObservation(Observation):
    """This data class represents the result from delegating to another agent"""

    agent_state: str
    observation: str = ObservationType.AGENT_STATE_CHANGED

    @property
    def message(self) -> str:
        return ''


@dataclass
class AgentCondensationObservation(Observation):
    """The output of a condensation action."""

    observation: str = ObservationType.CONDENSE

    @property
    def message(self) -> str:
        return self.content


@dataclass
class AgentThinkObservation(Observation):
    """The output of a think action.

    In practice, this is a no-op, since it will just reply a static message to the agent
    acknowledging that the thought has been logged.
    """

    observation: str = ObservationType.THINK

    @property
    def message(self) -> str:
        return self.content


@dataclass
class RecallObservation(Observation):
    """The output of a recall action from an agent or from the environment (automatic memory operations)."""

    observation: str = ObservationType.RECALL
    recall_type: RecallType = RecallType.DEFAULT

    # For environment_info
    repo_name: str = ''
    repo_directory: str = ''
    repo_instructions: str = ''
    runtime_hosts: dict[str, int] | list[str] = field(default_factory=dict)

    # For knowledge_microagent
    microagent_knowledge: list[dict[str, str]] = field(default_factory=list)
    triggered_content: list[dict[str, str]] = field(default_factory=list)

    # Aliases for backward compatibility
    @property
    def repository_name(self) -> str:
        return self.repo_name

    @repository_name.setter
    def repository_name(self, value: str) -> None:
        self.repo_name = value

    @property
    def repository_directory(self) -> str:
        return self.repo_directory

    @repository_directory.setter
    def repository_directory(self, value: str) -> None:
        self.repo_directory = value

    @property
    def repository_instructions(self) -> str:
        return self.repo_instructions

    @repository_instructions.setter
    def repository_instructions(self, value: str) -> None:
        self.repo_instructions = value

    def __post_init__(self):
        # Sync triggered_content and microagent_knowledge
        if self.triggered_content and not self.microagent_knowledge:
            self.microagent_knowledge = self.triggered_content
        elif self.microagent_knowledge and not self.triggered_content:
            self.triggered_content = self.microagent_knowledge

    @property
    def message(self) -> str:
        return self.__str__()

    def __str__(self) -> str:
        # Build a string representation of all fields
        fields = [
            f'recall_type={self.recall_type}',
            f'repo_name={self.repo_name}',
            f'repo_instructions={self.repo_instructions[:20]}...'
            if self.repo_instructions
            else 'repo_instructions=',
            f'runtime_hosts={self.runtime_hosts}',
            f'microagent_knowledge={self.microagent_knowledge}',
        ]
        return f'Recalled: {", ".join(fields)}'
