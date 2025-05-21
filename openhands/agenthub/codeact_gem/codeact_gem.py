import os
from jinja2 import Environment, FileSystemLoader

from openhands.agenthub.codeact_agent.codeact_agent import CodeActAgent
from openhands.core.config import AgentConfig
from openhands.llm.llm import LLM
from openhands.agenthub.codeact_agent.tools import (
    BrowserTool,
    FinishTool,
    IPythonTool,
    ThinkTool,
    create_cmd_run_tool,
)
from .utils.function_calling import response_to_actions as codeact_gem_response_to_actions
from .tools.editor import (
    create_view_file_tool,
    create_create_file_tool,
    create_replace_in_file_tool,
    create_insert_in_file_tool,
    create_undo_edit_tool,
)
from openhands.core.schema import ActionType
from openhands.events.action import Action
from typing import List, Dict, Any
from litellm import ModelResponse
from openhands.llm.tool_names import STR_REPLACE_EDITOR_TOOL_NAME


class CodeActGemAgent(CodeActAgent):
    VERSION = "1.0"
    PROMPT_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'prompts')

    def __init__(self, llm: LLM, config: AgentConfig):
        super().__init__(llm, config)
        self.prompt_env = Environment(loader=FileSystemLoader(self.PROMPT_TEMPLATE_DIR))
        self.current_system_prompt_template_name = 'system_prompt.j2' # Default prompt

    def _init_tools(self) -> None:
        super()._init_tools()  # Initialize tools from CodeActAgent

        # Filter out the old str_replace_editor tool
        self.tools = [tool for tool in self.tools if tool['function']['name'] != STR_REPLACE_EDITOR_TOOL_NAME]

        # Add the new flattened tools
        self.tools.extend([
            create_view_file_tool(),
            create_create_file_tool(),
            create_replace_in_file_tool(),
            create_insert_in_file_tool(),
            create_undo_edit_tool(),
        ])

        # Update tool_names and mcp_tool_names
        self.tool_names = [tool['function']['name'] for tool in self.tools]
        # If MCP tools were added by super()._init_tools() and included in self.tools,
        # they will be part of self.tool_names.
        # If they are managed separately or via config only, ensure they are still added.
        # CodeActAgent's _init_tools already adds mcp_tool_names to self.tool_names.
        # So, re-calculating self.tool_names from self.tools should be fine.
        # We just need to ensure mcp_tool_names (as a separate attribute for _parse_response) is correct.
        self.mcp_tool_names = self.config.mcp_tool_names or []
        # The self.tool_names list will now correctly reflect the full set of tools including MCP.

    def _get_system_prompt_template(self):
        return self.prompt_env.get_template(self.current_system_prompt_template_name)

    def set_swe_bench_mode(self, use_swe_prompt: bool):
        if use_swe_prompt:
            self.current_system_prompt_template_name = 'swe_bench/swe_gemini.j2'
        else:
            self.current_system_prompt_template_name = 'system_prompt.j2'
        # Invalidate any cached system prompt if the agent caches it
        if hasattr(self, '_system_prompt'):
            delattr(self, '_system_prompt')
        if hasattr(self, '_prompt_configs'): # if prompt configs are cached
             if 'system_prompt' in self._prompt_configs:
                del self._prompt_configs['system_prompt']
        # Reset message history to reflect the new prompt if needed by the agent's logic
        # For now, we assume changing the template name is sufficient before the next LLM call.
        # CodeActAgent seems to rebuild messages on each step, so this should be fine.

    def _parse_response(self, response: ModelResponse) -> List[Action]:
        return codeact_gem_response_to_actions(response, mcp_tool_names=self.mcp_tool_names)
