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
  - Implementation: Create subdirectories within the global workspace for each project/conversation

* **Project Switching** ❌ (not supported)
  - Current: No UI for switching between projects
  - Needed: Project selector in the sidebar or top navigation
  - Implementation: Switch the active conversation to one associated with the selected project

* **Project Creation** ❌ (not supported)
  - Current: No dedicated project creation flow
  - Needed: "New Project" button with directory selection
  - Implementation: Create a new subdirectory in the global workspace with a unique identifier

* **Project Settings** ❌ (not supported)
  - Current: Global settings only
  - Needed: Per-project settings (e.g., runtime configuration, LLM selection)
  - Implementation: Store settings in a project configuration file

### Alternative Cloud-Based Approach

If implementing the "No Local Directory Mounting" approach:

* **Repository Integration** ❌ (not supported)
  - Current: Local directory mounting
  - Needed: Direct integration with GitHub, GitLab, etc.
  - Implementation: OAuth authentication and API integration

* **Workspace Persistence** ❌ (not supported)
  - Current: Ephemeral Docker containers
  - Needed: Persistent storage for each conversation
  - Implementation: Docker volumes or cloud storage integration

* **File Synchronization** ❌ (not supported)
  - Current: Manual file upload/download
  - Needed: Automatic syncing between local and remote
  - Implementation: Background sync process with conflict resolution

### Project and Conversation Models

Given the architectural constraints of OpenHands (isolated Docker containers but shared host directory), the most consistent model is:

#### One-to-One Project-Conversation Relationship
* **Project Definition**: Each conversation is its own project with a unique workspace directory
* **Implementation**: Create isolated copies of source directories in `workspaces/conversation_{sid}`
* **Use Case**: Complete isolation between different tasks or projects
* **Advantages**: 
  - Consistency between filesystem and runtime states
  - Ability to work on different git branches in different conversations
  - No unexpected side effects from other conversations

#### Alternative (But Problematic) Approach: Project as a Container
* **Project Definition**: A project corresponds to a specific directory on disk and contains multiple conversations
* **Workspace Sharing**: Conversations within the same project share the same workspace directory
* **Problems**:
  - Git branch changes in one conversation affect all conversations
  - File changes are visible across conversations, but runtime changes (installed packages, running servers) are not
  - Creates confusing inconsistencies in the user experience

### Conversation Management

* **Project-Based Conversations** ❌ (not supported)
  - Current: All conversations share the same global workspace
  - Needed: One-to-one mapping between conversations and projects with isolated workspaces

* **Conversation History** ✅ (supported)
  - Current: Conversation history is saved and can be revisited
  - Needed: Organize conversation history by project

* **Project Templates** ❌ (not supported)
  - Current: No way to create new conversations from templates
  - Needed: Ability to create new projects based on templates or existing projects

* **Workspace Synchronization** ❌ (not supported)
  - Current: No way to sync changes between workspaces
  - Needed: Optional ability to sync changes from one project to another

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

#### For One-to-One Project-Conversation Mapping

To implement the recommended approach with isolated workspaces:

1. **Modify AppConfig**: Update `AppConfig` to support per-conversation workspace paths
   ```python
   # Example modification to AppConfig
   def get_workspace_path_for_conversation(self, conversation_id):
       return os.path.join(self.workspace_base, f"conversation_{conversation_id}")
   ```

2. **Update Docker Runtime**: Modify the Docker runtime to use different host directories for different conversations
   ```python
   # Example modification to DockerRuntime
   volumes = {
       self.config.get_workspace_path_for_conversation(sid): {
           'bind': self.config.workspace_mount_path_in_sandbox,
           'mode': 'rw',
       }
   }
   ```

3. **Create Project Management Layer**: Implement a project management system that:
   - Creates new workspace directories for each conversation
   - Copies files from source to conversation workspace
   - Tracks relationships between projects and conversations

4. **Implement Native macOS Integration**: Use Electron or a similar framework to:
   - Provide native file pickers
   - Support drag and drop
   - Integrate with Finder
   - Add menu bar access

5. **Design UI for Project Management**: Create interfaces for:
   - Project creation and selection
   - Workspace directory management
   - Project settings configuration

#### For No Local Directory Mounting Approach

To implement the cloud-based approach:

1. **Implement Repository Integration**: Add OAuth authentication and API integration with:
   - GitHub
   - GitLab
   - Bitbucket
   - Other cloud storage providers

2. **Create Persistent Storage System**: Develop a system for:
   - Creating and managing Docker volumes
   - Associating volumes with conversations
   - Persisting data between sessions

3. **Build File Synchronization**: Implement a sync system that:
   - Detects changes in local and remote repositories
   - Resolves conflicts
   - Provides visual diff tools
   - Automates push/pull operations

## Conclusion

The investigation confirms that the current OpenHands web UI mounts the same host directory for all conversations, which creates a limitation for users who want to work on multiple projects simultaneously. This is because the workspace configuration is global rather than per-conversation.

### Architectural Constraints

A critical consideration is that each conversation already runs in its own isolated Docker container sandbox. This means:

1. Each conversation has isolated runtime state (installed packages, running processes)
2. But all conversations share the same filesystem state (the host directory)

This creates an inconsistency where file changes (including git branch switches) are visible across all conversations, but runtime changes are not.

### Recommended Approach: One-to-One Project-Conversation Mapping

Given the existing architecture, the most consistent approach for a Mac desktop client would be:

- Each conversation is its own project with a unique workspace directory
- Workspaces are isolated copies of source directories
- Complete separation between different tasks or projects
- Simpler mental model: one conversation = one project = one workspace

This approach maintains consistency between filesystem and runtime states, allowing users to:
1. Work on different git branches in different conversations
2. Install different dependencies in different conversations
3. Run different servers or processes in different conversations

#### Implementation Details

The technical implementation would:

1. **Use Global Workspace as Container**: The current global `workspace` directory would serve as the parent container for all conversation-specific workspaces.

2. **Create Per-Conversation Subdirectories**: Within this global workspace, create subdirectories with names like:
   - `workspaces/repo_name_sid` (for repository-based projects)
   - `workspaces/default_sid` (for non-repository projects)
   - `workspaces/conversation_sid` (generic naming scheme)

3. **Copy Files for Each Conversation**: When a user starts a new conversation, the system would:
   - Create a new subdirectory with a unique name (using the conversation SID)
   - Copy the source files from the original location to this new subdirectory
   - Mount this subdirectory as the workspace for the conversation's Docker container

4. **Modify AppConfig**: Update the configuration to support per-conversation workspace paths.

This approach provides isolation while maintaining a centralized location for managing all conversation workspaces.

### Alternative Thought Experiment: No Local Directory Mounting

What if we don't mount any local directory in the Docker runtime (set it to None)? This creates an interesting scenario:

1. **Ephemeral Workspaces**: Each Docker container would have its own filesystem that exists only for the duration of the container's life.

2. **User Options for Repository Work**:
   - **Git Clone on Start**: Users would need to clone repositories at the start of each conversation.
   - **Persistent Volume Mounting**: Instead of mounting local directories, mount persistent Docker volumes.
   - **Cloud Storage Integration**: Integrate with GitHub, GitLab, or other cloud storage to pull/push code.
   - **File Upload/Download**: Users would need to upload files to work on them and download results.

3. **Advantages**:
   - Complete isolation between conversations
   - No risk of one conversation affecting another
   - Simpler architecture (no need to manage workspace copies)

4. **Disadvantages**:
   - More setup work for users (cloning repos each time)
   - Risk of losing work if not pushed to remote
   - Less convenient for local development
   - Slower workflow (need to push/pull changes)

This approach would be more suitable for cloud-based deployments where users primarily work with remote repositories rather than local files.
