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
    121 
    122 This documentation provides a technical foundation for starting the Swift/Cocoa Mac app development, focusing on precise details and actionable information derived from the existing codebase.
    123 
    124 ## 4. Glossary of Technical Details
    125 
    126 ### 4.1. REST API Endpoints
    127 
    128 | Endpoint                                                 | Method   | Description                                                                 | Request Parameters                                                                                                | Response Format                                  |
    129 | :------------------------------------------------------- | :------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------- |
    130 | `/api/conversations/{conversation_id}/list-files`        | GET      | Lists files in the specified path within the agent's workspace.             | `conversation_id` (path), `path` (query, optional)                                                               | JSON list of file paths                        |
    131 | `/api/conversations/{conversation_id}/select-file`      | GET      | Retrieves the content of a specified file.                               | `conversation_id` (path), `file` (query, required - absolute path in runtime)                                     | JSON: `{'code': file_content}`                   |
    132 | `/api/conversations/{conversation_id}/save-file`        | POST     | Saves (writes/updates) the content of a file in the agent's workspace.      | `conversation_id` (path), Request Body (JSON): `{'filePath': relative_path, 'content': file_content}`             | JSON: `{'message': 'File saved successfully'}`   |
    133 | `/api/conversations/{conversation_id}/upload-files`      | POST     | Uploads one or more files to the agent's workspace.                         | `conversation_id` (path), Request Body (multipart/form-data): `files` (list of files)                             | JSON: `{'message': ..., 'uploaded_files': [], 'skipped_files': []}` |\n| `/api/conversations/{conversation_id}/zip-directory`    | GET      | Downloads the entire workspace as a zip file.                               | `conversation_id` (path)                                                                                           | File response (workspace.zip)                    |\n| `/api/conversations`                                    | POST     | Creates a new conversation.                                               | Request Body (JSON): `InitSessionRequest` (`selected_repository`, `initial_user_msg`, `image_urls`)               | JSON: `{'conversation_id': conversation_id}`      |\n| `/api/conversations`                                    | GET      | Searches and retrieves a list of conversations (paginated).                | `page_id` (query, optional), `limit` (query, optional)                                                            | `ConversationInfoResultSet` JSON                 |\n| `/api/conversations/{conversation_id}`                  | GET      | Retrieves details of a specific conversation.                              | `conversation_id` (path)                                                                                           | `ConversationInfo` JSON or `null`               |\n| `/api/conversations/{conversation_id}`                  | PATCH    | Updates a conversation (currently only title).                             | `conversation_id` (path), Request Body (body parameter): `title`                                                | `True` or `False` JSON                             |\n| `/api/conversations/{conversation_id}`                  | DELETE   | Deletes a conversation.                                                     | `conversation_id` (path)                                                                                           | `True` or `False` JSON                             |\n| `/api/settings`                                          | GET      | Loads application settings.                                                 | None                                                                                                               | `SettingsWithTokenMeta` JSON or `null`           |\n| `/api/settings`                                          | POST     | Stores (saves/updates) application settings.                                | Request Body (JSON): `SettingsWithTokenMeta`                                                                       | JSON: `{'message': 'Settings stored'}`           |\n| `/api/options/models`                                     | GET      | Gets available AI models.                                                    | None                                                                                                               | JSON list of model names                         |\n| `/api/options/agents`                                     | GET      | Gets available agents.                                                       | None                                                                                                               | JSON list of agent names                         |\n| `/api/options/security-analyzers`                         | GET      | Gets available security analyzers.                                           | None                                                                                                               | JSON list of security analyzer names             |\n| `/api/options/config`                                      | GET      | Gets server configuration.                                                    | None                                                                                                               | Server configuration JSON                        |\n| `/api/conversations/{conversation_id}/config`            | GET      | Retrieves runtime configuration (runtime_id, session_id).                  | `conversation_id` (path)                                                                                           | JSON: `{'runtime_id': runtime_id, 'session_id': session_id}` |\n| `/api/conversations/{conversation_id}/vscode-url`        | GET      | Retrieves VS Code URL for the conversation's workspace.                     | `conversation_id` (path)                                                                                           | JSON: `{'vscode_url': vscode_url}`               |\n| `/api/conversations/{conversation_id}/web-hosts`        | GET      | Retrieves web hosts used by the runtime.                                     | `conversation_id` (path)                                                                                           | JSON: `{'hosts': list_of_hosts}`                  |\n\n### 4.2. `ActionType` Enum Values\n\n*   `INIT`: Agent initialization. Only sent by client.\n*   `MESSAGE`: Sending a chat message.\n*   `READ`: Reading a file.\n*   `WRITE`: Writing to a file.\n*   `RUN`: Running a bash command.\n*   `RUN_IPYTHON`: Running IPython code.\n*   `BROWSE`: Browsing a web page.\n*   `BROWSE_INTERACTIVE`: Interactive browser interaction.\n*   `DELEGATE`: Delegating a task to another agent.\n*   `FINISH`: Finishing the task.\n*   `REJECT`: Rejecting a request.\n*   `CHANGE_AGENT_STATE`: Changes the state of the agent, e.g. to paused or running\n\n### 4.3. `AgentState` Enum Values\n\n*   `LOADING`: Agent is loading/initializing.\n*   `INIT`: Agent is initialized.\n*   `RUNNING`: Agent is currently running/executing tasks.\n*   `AWAITING_USER_INPUT`: Agent is waiting for user input/message.\n*   `PAUSED`: Agent execution is paused.\n*   `STOPPED`: Agent execution is stopped.\n*   `FINISHED`: Agent has finished the task successfully.\n*   `REJECTED`: Agent rejected the task or request.\n*   `ERROR`: Agent encountered an error during execution.\n*   `RATE_LIMITED`: Agent is rate-limited by an external service (e.g., LLM API).\n*   `AWAITING_USER_CONFIRMATION`: Agent is waiting for user confirmation before proceeding with an action.\n*   `USER_CONFIRMED`: User has confirmed agent's action.\n*   `USER_REJECTED`: User has rejected agent's action.\n\n---\n
