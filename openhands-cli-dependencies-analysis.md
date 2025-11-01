# OpenHands CLI Dependencies on Main Codebase

This document analyzes all dependencies that the `openhands-cli` directory has on code outside of its directory (i.e., dependencies on the main `openhands` codebase).

## Summary

The openhands-cli depends on **two main external packages**:
1. **openhands-sdk** (version 1.0.0a5)
2. **openhands-tools** (version 1.0.0a5)

These are declared as dependencies in `openhands-cli/pyproject.toml:20-22`.

## Detailed Dependencies

### 1. openhands.sdk - Core SDK Classes

**Main Imports:**
- `Agent` - Agent specification and configuration
- `AgentContext` - Context for agent execution
- `BaseConversation` - Base conversation interface
- `Conversation` - Main conversation implementation
- `Workspace` - Workspace configuration
- `LLM` - Language model configuration
- `Message` - Message class for communication
- `Action` - Action class for agent actions
- `LocalFileStore` - Local file persistence
- `LLMSummarizingCondenser` - Memory condensation
- `register_tool` - Tool registration function

**Used in:**
- `openhands_cli/setup.py:5` - Core conversation setup
- `openhands_cli/runner.py:3` - Conversation execution
- `openhands_cli/agent_chat.py:11` - Main CLI interface
- `openhands_cli/tui/settings/store.py:17` - Settings persistence
- `openhands_cli/tui/settings/settings_screen.py:3` - Settings UI
- `openhands_cli/utils.py:7` - LLM utilities
- `openhands_cli/listeners/pause_listener.py:9` - Pause functionality
- `openhands_cli/tui/status.py:5` - Status display

### 2. openhands.sdk.conversation - Conversation State Management

**Main Imports:**
- `ConversationState` - Conversation state tracking
- `AgentExecutionStatus` - Agent execution status enum (PAUSED, FINISHED, WAITING_FOR_CONFIRMATION, etc.)
- `ConversationCallbackType` - Callback types for conversation events

**Used in:**
- `openhands_cli/runner.py:4` - State machine logic for conversation flow
- `openhands_cli/agent_chat.py:15` - Agent execution status checks
- Test files for conversation management

### 3. openhands.sdk.security - Security and Confirmation Policies

**Main Imports:**
- **confirmation_policy module:**
  - `AlwaysConfirm` - Policy to always ask for confirmation
  - `NeverConfirm` - Policy to never ask for confirmation
  - `ConfirmRisky` - Policy to confirm only risky actions
  - `ConfirmationPolicyBase` - Base class for confirmation policies
  - `SecurityRisk` - Security risk levels enum

- **llm_analyzer module:**
  - `LLMSecurityAnalyzer` - LLM-based security analysis

**Used in:**
- `openhands_cli/setup.py:12` - Setting up confirmation policies
- `openhands_cli/runner.py:5-9` - Confirmation mode toggle and handling
- `openhands_cli/user_actions/agent_action.py:4-8` - User confirmation flow
- `openhands_cli/user_actions/types.py:6` - Type definitions
- `openhands_cli/utils.py:5` - Default security analyzer setup

### 4. openhands.sdk.llm - LLM Configuration and Metrics

**Main Imports:**
- `VERIFIED_MODELS` - Dictionary of verified LLM providers and models
- `UNVERIFIED_MODELS_EXCLUDING_BEDROCK` - Dictionary of unverified models
- `utils.metrics.Metrics` - Metrics tracking
- `utils.metrics.TokenUsage` - Token usage tracking

**Used in:**
- `openhands_cli/user_actions/settings_action.py:3` - LLM provider/model selection
- Test files for metrics display

### 5. openhands.sdk.agent - Agent Base Classes

**Main Imports:**
- `AgentBase` - Base class for agents

**Used in:**
- Test files for agent mocking

### 6. openhands.sdk.context - Context Management

**Main Imports:**
- `condenser.LLMSummarizingCondenser` - Condenser for memory management

**Used in:**
- `openhands_cli/tui/settings/store.py:18` - Agent configuration with memory condensation
- `openhands_cli/tui/settings/settings_screen.py:3` - Settings for memory condensation

### 7. openhands.tools - Agent Tools

**Main Imports:**
- `execute_bash.BashTool` - Tool for bash command execution
- `file_editor.FileEditorTool` - Tool for file editing
- `task_tracker.TaskTrackerTool` - Tool for task tracking
- `preset.get_default_agent` - Get default agent configuration
- `preset.default.get_default_tools` - Get default tool set

**Used in:**
- `openhands_cli/setup.py:6-8` - Tool registration
- `openhands_cli/utils.py:6` - Default agent setup
- `openhands_cli/tui/settings/store.py:19` - Loading default tools for agent

## Key Files with External Dependencies

### Core CLI Files:

1. **`openhands_cli/setup.py`**
   - Purpose: Conversation and agent setup
   - Dependencies: openhands.sdk (Agent, Conversation, Workspace, register_tool), openhands.tools (BashTool, FileEditorTool, TaskTrackerTool), openhands.sdk.security.confirmation_policy

2. **`openhands_cli/runner.py`**
   - Purpose: Conversation execution and state management
   - Dependencies: openhands.sdk (BaseConversation, Message), openhands.sdk.conversation.state, openhands.sdk.security.confirmation_policy

3. **`openhands_cli/utils.py`**
   - Purpose: LLM and agent utilities
   - Dependencies: openhands.sdk (LLM), openhands.sdk.security.llm_analyzer, openhands.tools.preset

4. **`openhands_cli/tui/settings/store.py`**
   - Purpose: Agent settings persistence
   - Dependencies: openhands.sdk (Agent, AgentContext, LocalFileStore), openhands.sdk.context.condenser, openhands.tools.preset.default

5. **`openhands_cli/tui/settings/settings_screen.py`**
   - Purpose: Settings UI
   - Dependencies: openhands.sdk (LLM, BaseConversation, LLMSummarizingCondenser, LocalFileStore)

6. **`openhands_cli/user_actions/agent_action.py`**
   - Purpose: User confirmation for agent actions
   - Dependencies: openhands.sdk.security.confirmation_policy

7. **`openhands_cli/user_actions/settings_action.py`**
   - Purpose: Settings configuration prompts
   - Dependencies: openhands.sdk.llm (VERIFIED_MODELS, UNVERIFIED_MODELS_EXCLUDING_BEDROCK)

8. **`openhands_cli/listeners/pause_listener.py`**
   - Purpose: Keyboard listener for pausing agent
   - Dependencies: openhands.sdk (BaseConversation)

9. **`openhands_cli/agent_chat.py`**
   - Purpose: Main CLI entry point
   - Dependencies: openhands.sdk (Conversation, BaseConversation, Message), openhands.sdk.conversation.state

### Build Files:

10. **`build.py`**
    - Purpose: PyInstaller build script
    - Dependencies: openhands.sdk (LLM)

## Dependency Graph Summary

```
openhands-cli
├── openhands-sdk (1.0.0a5)
│   ├── Core classes: Agent, Conversation, LLM, Workspace, Message, Action
│   ├── conversation: ConversationState, AgentExecutionStatus
│   ├── security: confirmation policies, LLMSecurityAnalyzer
│   ├── llm: model lists, metrics
│   ├── agent: AgentBase
│   └── context: LLMSummarizingCondenser
└── openhands-tools (1.0.0a5)
    ├── BashTool
    ├── FileEditorTool
    ├── TaskTrackerTool
    └── preset: get_default_agent, get_default_tools
```

## Notes

- All dependencies are on the **openhands-sdk** and **openhands-tools** packages, which are separate PyPI packages (currently alpha versions)
- The CLI does **NOT** depend on the main `openhands` package directly in the repository
- These SDK and tools packages are maintained in the [All-Hands-AI/agent-sdk](https://github.com/All-Hands-AI/agent-sdk) repository
- The pyproject.toml includes commented-out `[tool.uv.sources]` section for pinning to specific git commits during development
