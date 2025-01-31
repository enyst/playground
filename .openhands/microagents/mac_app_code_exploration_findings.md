# OpenHands Mac App MVP - Code Exploration Findings

This document summarizes the findings from exploring the frontend and backend codebases of the OpenHands repository, focusing on aspects relevant to the development of the Mac App MVP using Swift/Cocoa.

## 1. Frontend Code Findings (React)

The web frontend is built using React and provides valuable UI components and logic that can be used as a reference for the Mac app development.

### 1.1. UI Components (frontend/src/components/features/)

* **Chat Feature (chat/):**
    * `chat/chat-input.tsx`: User input area component using `TextareaAutosize`. Handles text input, submission, image pasting/drag-and-drop. Key prop: `onSubmit(message: string)`.
    * `chat/interactive-chat-box.tsx`: Wraps `ChatInput` and adds image upload/display functionality. Prop: `onSubmit(message: string, images: File[])`.
    * `chat/messages.tsx`: Renders a list of chat messages.
    * `chat/chat-message.tsx`: Displays individual chat messages (agent outputs).
* **File Explorer Feature (file-explorer/):**
    * `file-explorer/file-explorer.tsx`: Main file explorer component, uses `useListFiles` hook to fetch file list and renders `ExplorerTree`.
    * `file-explorer/explorer-tree.tsx`: Renders the file tree structure recursively using `TreeNode` components.
    * `file-explorer/tree-node.tsx`: Renders individual file/folder nodes, uses `useListFiles` (for folders) and `useListFile` (for file content/metadata).
* **Controls Feature (controls/):**
    * `controls/agent-control-bar.tsx`: Contains Pause/Resume button using `ActionButton`. Sends `CHANGE_AGENT_STATE` actions.
    * `controls/agent-status-bar.tsx`: Displays agent status using `AGENT_STATUS_MAP` and Redux state.
* **Terminal Feature (terminal/):**
    * `terminal/terminal.tsx`: Renders a terminal UI using `xterm.js` and `useTerminal` hook.
    * `hooks/use-terminal.ts`: Custom hook for integrating `xterm.js`, handling input, output, and commands.

### 1.2. Shared Components (frontend/src/components/shared/)

* `buttons/action-button.tsx`: Reusable button component for triggering agent actions, with tooltip and styling.
* `modals/settings/settings-modal.tsx`: Modal for displaying and editing application settings, uses `SettingsForm`.
* `modals/settings/settings-form.tsx`: Form component within `SettingsModal`, contains various input fields for settings.

### 1.3. Hooks (frontend/src/hooks/query/)

* `hooks/query/use-list-files.ts`: Fetches file list from backend API endpoint `/api/conversations/{conversation_id}/list-files`.
* `hooks/query/use-list-file.ts`: (Misnamed, should be `useFileContent`) Fetches file content from backend API endpoint `/api/conversations/{conversation_id}/select-file`.
* `hooks/use-terminal.ts`: Integrates `xterm.js` terminal emulator, handles input, output, and commands.

### 1.4. Contexts (frontend/src/context/)

* `context/ws-client-provider.tsx`: Provides WebSocket context (`WsClientContext`, `useWsClient`) for SocketIO communication. Manages connection and `send` function.
* `context/conversation-context.tsx`: Provides conversation ID context (`ConversationContext`, `useConversation`) from route parameters.
* `context/files.tsx`: Provides file-related state management context (`FilesContext`, `useFiles`) for file explorer.
* `context/settings-context.tsx`: Provides settings management context.

### 1.5. API Client (frontend/src/api/)

* `api/open-hands.ts`: Defines `OpenHands` API client class with methods for interacting with backend REST API endpoints (e.g., `getFiles`, `getFile`, `saveFile`, `getSettings`, `saveSettings`, `createConversation`, `getModels`, `getAgents`).
* `api/open-hands-axios.ts`: Configures Axios instance for API requests, handles authorization headers.

### 1.6. Types and Enums (frontend/src/types/)

* `types/action-type.tsx`: Defines `ActionType` enum listing all possible action types sent to the backend (e.g., `MESSAGE`, `RUN`, `READ`, `WRITE`, `CHANGE_AGENT_STATE`).
* `types/agent-state.tsx`: Defines `AgentState` enum listing all possible agent states (e.g., `RUNNING`, `AWAITING_USER_INPUT`, `STOPPED`).
* `components/agent-status-map.constant.ts`: Defines `AGENT_STATUS_MAP` constant, mapping `AgentState` to status messages and indicator styles.

## 2. Backend Code Findings (Python FastAPI)

The backend is built using FastAPI and provides REST API endpoints and a SocketIO server for communication.

### 2.1. SocketIO Server (openhands/server/listen_socket.py)

* Sets up SocketIO server using `socketio.AsyncServer`.
* Handles `connect`, `oh_action`, and `disconnect` events.
* Implements authentication and authorization for Saas mode using JWT cookies.
* Manages conversations and agent sessions using `conversation_manager`.
* Streams agent events to clients via `oh_event` events.

### 2.2. API Endpoints (openhands/server/routes/)

* **File Management (files.py):**
    * `GET /api/conversations/{conversation_id}/list-files`: Lists files in workspace.
    * `GET /api/conversations/{conversation_id}/select-file`: Retrieves file content.
    * `POST /api/conversations/{conversation_id}/save-file`: Saves file content.
    * `POST /api/conversations/{conversation_id}/upload-files`: Uploads files to workspace.
    * `GET /api/conversations/{conversation_id}/zip-directory`: Downloads workspace as zip.
* **Conversation Management (manage_conversations.py):**
    * `POST /api/conversations`: Creates a new conversation.
    * `GET /api/conversations`: Lists/searches conversations.
    * `GET /api/conversations/{conversation_id}`: Retrieves conversation details.
    * `PATCH /api/conversations/{conversation_id}`: Updates conversation (e.g., title).
    * `DELETE /api/conversations/{conversation_id}`: Deletes conversation.
* **Settings (settings.py):**
    * `GET /api/settings`: Loads application settings.
    * `POST /api/settings`: Stores application settings.
* **Options (public.py):**
    * `GET /api/options/models`: Gets available AI models.
    * `GET /api/options/agents`: Gets available agents.
    * `GET /api/options/security-analyzers`: Gets available security analyzers.
    * `GET /api/options/config`: Gets server configuration.

### 2.3. Shared Resources (openhands/server/shared.py)

* Initializes and provides shared instances of `sio` (SocketIO server), `conversation_manager`, `config`, `server_config`, `file_store`, `SettingsStoreImpl`, `ConversationStoreImpl`.

### 2.4. Core Agent Logic (openhands/core/)

* `core/main.py`: CLI entry point, contains `run_controller` function for agent execution loop.
* `core/loop.py`: Defines `run_agent_until_done` function, the agent's main execution loop (simple polling loop).
* `core/config/`: Contains configuration loading logic.
* `core/exceptions.py`: Defines core exceptions.

## 3. Key Takeaways for Mac App Development (Swift/Cocoa)

* **Technology Stack:** Swift/Cocoa is chosen for native Mac app development.
* **MVP Feature Prioritization:** Confirmed focus on MVP features: Task Input Area, Agent Output Display, Basic File Explorer, Start/Stop Control Buttons, Backend Connection Settings.
* **Backend Communication:** Mac app needs to implement:
    * **SocketIO Client:** To connect to backend, send `oh_action` events, and receive `oh_event` events. Use `WsClientProvider` and `useWsClient` in frontend code as reference.
    * **REST API Client:** To call backend REST API endpoints for file management, settings, and conversation creation. Use `OpenHands` API client in frontend code as reference.
* **UI Components:** Consider adapting or reimplementing relevant React components in Swift/Cocoa:
    * Chat input area (similar to `ChatInput`).
    * Agent output display (similar to `Messages` / `chat-message.tsx`, potentially using `xterm.js` or native terminal view for command output).
    * File explorer (similar to `FileExplorer`, `ExplorerTree`, `TreeNode`, using file management APIs).
    * Control buttons (Start/Stop/Pause/Resume, similar to `ActionButton`).
    * Settings panel (similar to `SettingsModal` / `SettingsForm`, using settings APIs).
* **State Management:** Implement state management in the Mac app, potentially inspired by Redux or React Context patterns used in the frontend. Consider managing agent state, conversation state, file explorer state, and settings state.
* **Authentication (if needed for Saas mode):** Implement JWT cookie-based authentication similar to the backend and web frontend if targeting Saas mode. For OSS mode, authentication might be skipped.
* **Configuration:** Allow users to configure backend connection settings (host, TLS) in the Mac app's settings panel, similar to `VITE_BACKEND_HOST` and `VITE_USE_TLS` environment variables in the frontend.
* **Conversation Management:** Implement conversation creation using the `POST /api/conversations` endpoint.

This documentation provides a technical foundation for starting the Swift/Cocoa Mac app development, focusing on precise details and actionable information derived from the existing codebase.