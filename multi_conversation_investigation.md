# Investigation: Multi-Conversation Sandbox Mounting

## Initial Question
The question is whether the OpenHands web UI mounts a sandbox on the same host directory for all conversations, which would mean users cannot use the web UI for multiple projects in different directories of their local drive.

## Investigation Plan
1. Examine the codebase to understand how conversations and sandboxes are managed
2. Look for code related to mounting directories and sandbox creation
3. Determine how multiple conversations are handled
4. Assess the current UX implications
5. Propose improvements for a Mac desktop client

## Findings

### Initial Repository Exploration
The repository has a Python backend in the `openhands` directory and a React frontend in the `frontend` directory. Let's explore these to understand how conversations and sandboxes are managed.

### Conversation and Runtime Architecture
After examining the codebase, I found that:

1. Each conversation is managed by the `Conversation` class in `openhands/server/session/conversation.py`
2. Each conversation gets its own Docker container through the `DockerRuntime` class in `openhands/runtime/impl/docker/docker_runtime.py`
3. Containers are named with a prefix and the session ID: `CONTAINER_NAME_PREFIX + sid`
4. The `StandaloneConversationManager` in `openhands/server/conversation_manager/standalone_conversation_manager.py` manages conversations and creates a new `Conversation` instance for each session

### Workspace Configuration
The workspace configuration is defined in the `AppConfig` class in `openhands/core/config/app_config.py` with these key properties:

- `workspace_base`: Base path for the workspace (default: "./workspace")
- `workspace_mount_path`: Path to mount the workspace (defaults to `workspace_base`)
- `workspace_mount_path_in_sandbox`: Path to mount the workspace in sandbox (default: "/workspace")
- `workspace_mount_rewrite`: Path to rewrite the workspace mount path (optional)

### Docker Runtime Implementation
In the Docker runtime implementation, the host directory is mounted to the container with:

```python
volumes = {
    self.config.workspace_mount_path: {
        'bind': self.config.workspace_mount_path_in_sandbox,
        'mode': 'rw',
    }
}
```

### Key Finding: Shared Host Directory
**The current implementation does mount the same host directory for all conversations.** This means:

1. All conversations (Docker containers) share the same workspace directory on the host
2. Changes made in one conversation are visible to all other conversations
3. Users cannot work on multiple projects in different directories simultaneously through the web UI

This confirms the initial concern that users cannot use the web UI for multiple projects in different directories of their local drive without manually switching directories or risking conflicts.

### Potential Solutions
To address this limitation, several approaches could be considered:

1. **Per-conversation workspace configuration**: Allow each conversation to specify its own workspace directory
2. **Project/workspace selector in the UI**: Add a UI element to switch between different project directories
3. **Isolated workspace directories**: Automatically create isolated workspace directories for each conversation
4. **Virtual filesystem**: Implement a virtual filesystem that maps different conversation workspaces to different host directories

## Mac Desktop Client UX Design

A Mac desktop client could provide an improved user experience for working with multiple projects. Here's a proposed UX design:

### Project Management

* **Project Workspaces** ✅ (partially supported)
  - Current: Single global workspace directory configured in settings
  - Needed: Multiple named project workspaces with different directories

* **Project Switching** ❌ (not supported)
  - Current: No UI for switching between projects
  - Needed: Project selector in the sidebar or top navigation

* **Project Creation** ❌ (not supported)
  - Current: No dedicated project creation flow
  - Needed: "New Project" button with directory selection

* **Project Settings** ❌ (not supported)
  - Current: Global settings only
  - Needed: Per-project settings (e.g., runtime configuration, LLM selection)

### Project and Conversation Models

There are two potential models for the relationship between projects and conversations:

#### Option 1: Project as a Container for Multiple Conversations
* **Project Definition**: A project corresponds to a specific directory on disk and can contain multiple conversations
* **Workspace Sharing**: Conversations within the same project share the same workspace directory
* **Use Case**: Working on different aspects of the same codebase in parallel conversations

#### Option 2: One-to-One Project-Conversation Relationship
* **Project Definition**: Each conversation is its own project with a unique workspace directory
* **Implementation**: Create isolated copies of source directories in `workspaces/conversation_{sid}`
* **Use Case**: Complete isolation between different tasks or projects

### Conversation Management

* **Project-Based Conversations** ❌ (not supported)
  - Current: All conversations share the same global workspace
  - Needed: Either option 1 (grouped conversations) or option 2 (1:1 mapping)

* **Conversation History** ✅ (supported)
  - Current: Conversation history is saved and can be revisited
  - Needed: Organize conversation history by project

* **Conversation Transfer** ❌ (not supported)
  - Current: No way to move conversations between projects
  - Needed: Ability to move or copy conversations between projects (only relevant for Option 1)

### File System Integration

* **Native File Picker** ❌ (not supported)
  - Current: File operations happen within the sandbox
  - Needed: Native macOS file picker integration for opening/saving files

* **Finder Integration** ❌ (not supported)
  - Current: No Finder integration
  - Needed: Right-click "Open with OpenHands" in Finder

* **Drag and Drop** ❌ (not supported)
  - Current: No drag and drop support
  - Needed: Drag files from Finder into conversations

### System Integration

* **Menu Bar Access** ❌ (not supported)
  - Current: Web UI only
  - Needed: macOS menu bar icon for quick access

* **Notifications** ❌ (not supported)
  - Current: No system notifications
  - Needed: Native macOS notifications for completed tasks

* **Keyboard Shortcuts** ✅ (partially supported)
  - Current: Basic web shortcuts
  - Needed: Full macOS keyboard shortcut support

### Technical Implementation Considerations

To implement this improved UX, the following changes would be needed:

1. Modify `AppConfig` to support per-conversation workspace paths
2. Update the Docker runtime to use different host directories for different conversations
3. Create a project management layer in the application
4. Implement native macOS integration using Electron or a similar framework
5. Design a UI for project switching and management

## Conclusion

The investigation confirms that the current OpenHands web UI mounts the same host directory for all conversations, which creates a limitation for users who want to work on multiple projects simultaneously. This is because the workspace configuration is global rather than per-conversation.

A Mac desktop client could address this limitation by implementing one of two project models:

### Option 1: Projects as Containers
- A project corresponds to a specific directory on disk
- Multiple conversations can exist within a project, sharing the same workspace
- Users can work on different aspects of the same codebase in parallel conversations
- Project switching changes the workspace directory for all new conversations

### Option 2: One-to-One Project-Conversation Mapping
- Each conversation is its own project with a unique workspace directory
- Workspaces are isolated copies of source directories
- Complete separation between different tasks or projects
- Simpler mental model: one conversation = one project = one workspace

Both approaches would significantly enhance the usability of OpenHands for users who work on multiple projects, making it a more versatile tool for software development and other tasks that require context switching between different workspaces.

The technical implementation would require modifying the `AppConfig` to support either per-project or per-conversation workspace paths, depending on which model is chosen.
