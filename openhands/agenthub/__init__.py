from dotenv import load_dotenv

load_dotenv()

from openhands.controller.agent import Agent # noqa: E402
from .codeact_agent.codeact_agent import CodeActAgent # noqa: E402
from .codeact_gem.codeact_gem import CodeActGemAgent # noqa: E402
from .browsing_agent.browsing_agent import BrowsingAgent # noqa: E402
from .visualbrowsing_agent.visual_browsing_agent import VisualBrowsingAgent # noqa: E402
from .readonly_agent.readonly_agent import ReadOnlyAgent # noqa: E402
# Assuming DummyAgent might be in dummy_agent.dummy_agent or similar,
# but it's not strictly required by the problem description to list all, just CodeActGemAgent.
# For now, I will only include the ones explicitly mentioned or implied by the __all__ structure.

# List of all available agents
OPENHANDS_AGENTS: list[type[Agent]] = [
    CodeActAgent,
    CodeActGemAgent, # Added here
    BrowsingAgent,
    VisualBrowsingAgent,
    ReadOnlyAgent,
    # Add DummyAgent here if it exists and is needed following the same pattern.
]

# __all__ can be used to control what `from openhands.agenthub import *` imports,
# but OPENHANDS_AGENTS will be the primary mechanism for agent registration.
__all__ = [
    'Agent',
    'CodeActAgent',
    'CodeActGemAgent',
    'BrowsingAgent',
    'VisualBrowsingAgent',
    'ReadOnlyAgent',
    # Add 'DummyAgent' if it's included in OPENHANDS_AGENTS
    'OPENHANDS_AGENTS',
]
