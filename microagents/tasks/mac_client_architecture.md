# Mac Client Architecture

This document outlines the high-level architecture for the OpenHands Mac client, detailing how it will manage socket connections, application state, and SwiftUI views based on the server's socket.io API.

## Core Components

### SocketIOService

The `SocketIOService` is responsible for managing the WebSocket connection to the OpenHands server.

#### Responsibilities:
- Establish and maintain a socket.io connection to the server
- Handle connection, disconnection, and reconnection logic
- Emit events to the server (oh_action)
- Listen for events from the server (oh_event)
- Parse and validate incoming event data
- Provide a clean API for other components to interact with the socket

#### Key Methods:
```swift
func connect(conversationId: String, latestEventId: Int?)
func disconnect()
func sendAction(action: String, args: [String: Any])
func sendMessage(content: String, imageUrls: [String]?)
func executeCommand(command: String, securityRisk: Bool, confirmationState: String?, thought: String?)
func readFile(path: String)
func writeFile(path: String, content: String)
func editFile(path: String, oldContent: String, newContent: String)
func browseUrl(url: String)
```

#### Event Handling:
```swift
private func setupEventHandlers() {
    socket.on("oh_event") { [weak self] data, ack in
        // Parse event data and notify observers
    }
    
    socket.on("connect") { [weak self] data, ack in
        // Handle successful connection
    }
    
    socket.on("disconnect") { [weak self] data, ack in
        // Handle disconnection
    }
    
    socket.on("error") { [weak self] data, ack in
        // Handle errors
    }
}
```

### AppState (ObservableObject)

The `AppState` class serves as the central state management system for the application, following the MVVM pattern.

#### Properties:
```swift
// Connection state
@Published var isConnected: Bool = false
@Published var isConnecting: Bool = false
@Published var connectionError: String? = nil

// Conversation data
@Published var conversationId: String? = nil
@Published var events: [Event] = []
@Published var latestEventId: Int? = nil

// Agent state
@Published var agentState: String = "idle" // idle, thinking, executing, etc.
@Published var isAwaitingUserConfirmation: Bool = false

// UI state
@Published var selectedImages: [UIImage] = []
@Published var messageText: String = ""
@Published var isSubmitting: Bool = false

// File explorer state
@Published var fileStructure: [FileNode] = []
@Published var selectedFilePath: String? = nil

// Terminal state
@Published var terminalCommands: [TerminalCommand] = []
```

#### Methods:
```swift
// Connection management
func connectToServer(conversationId: String)
func disconnectFromServer()

// Message handling
func sendMessage(text: String, images: [UIImage]?)
func stopAgent()
func continueConversation()

// Event processing
func processEvent(_ event: Event)
func handleAgentMessage(_ event: Event)
func handleCommandOutput(_ event: Event)
func handleFileOperation(_ event: Event)
func handleBrowserOutput(_ event: Event)
func handleAgentStateChange(_ event: Event)
func handleError(_ event: Event)

// File operations
func refreshFileExplorer()
func selectFile(path: String)
func readFile(path: String)
func saveFile(path: String, content: String)

// Terminal operations
func executeCommand(command: String)
```

### Data Models

#### Event Model
```swift
struct Event: Identifiable {
    let id: Int
    let timestamp: String
    let source: String // "agent" or "user"
    let message: String
    let cause: Int?
    
    // For actions
    let action: String?
    let args: [String: Any]?
    
    // For observations
    let observation: String?
    let content: String?
    let extras: [String: Any]?
}
```

#### Message Model
```swift
struct Message: Identifiable {
    let id: UUID = UUID()
    let eventId: Int
    let timestamp: String
    let source: String // "agent" or "user"
    let content: String
    let imageUrls: [String]?
    let isError: Bool
    let isAction: Bool
    let isExpandable: Bool
    let actionSuccess: Bool?
}
```

#### FileNode Model
```swift
struct FileNode: Identifiable {
    let id: UUID = UUID()
    let name: String
    let path: String
    let isDirectory: Bool
    let children: [FileNode]?
    let isExpanded: Bool
}
```

#### TerminalCommand Model
```swift
struct TerminalCommand: Identifiable {
    let id: UUID = UUID()
    let command: String
    let output: String
    let exitCode: Int
    let isRunning: Bool
}
```

## SwiftUI Views

### Main Views

#### MainView
The root view of the application that manages the overall layout.
- Contains the split view with file explorer, chat interface, and terminal
- Manages the resizable panels

#### ChatInterfaceView
The main chat interface that displays messages and handles user input.
- Displays the list of messages
- Contains the chat input box
- Shows typing indicators and suggestions
- Handles message submission and agent control

#### FileExplorerView
Displays the file structure of the workspace.
- Shows a hierarchical tree of files and folders
- Allows navigation and selection of files
- Provides refresh functionality

#### TerminalView
Provides a terminal interface for command execution.
- Displays command history and output
- Allows command input
- Shows command execution status

### Chat Components

#### MessagesView
Displays the list of chat messages.
- Renders different message types (user, agent, action, error)
- Handles scrolling and visibility

#### ChatMessageView
Renders an individual chat message with appropriate styling.
- Displays text content
- Shows images if present
- Applies different styles based on sender

#### ExpandableMessageView
A message that can be expanded to show more content.
- Collapses long content by default
- Provides expand/collapse functionality
- Shows error and action details

#### InteractiveChatBoxView
Combines chat input with image upload functionality.
- Contains text input field
- Provides image upload button
- Shows selected images
- Handles message submission

#### TypingIndicatorView
Shows an animation indicating the agent is typing.
- Displays animated dots or similar indicator
- Shows when agent is processing

#### ChatSuggestionsView
Displays suggested queries for the user.
- Shows clickable suggestion buttons
- Handles suggestion selection

### File Explorer Components

#### ExplorerTreeView
Renders a hierarchical tree of files and folders.
- Displays file and folder nodes
- Handles expand/collapse of folders
- Manages selection of files

#### TreeNodeView
Renders a single node in the file explorer tree.
- Shows appropriate icon for file type
- Displays file/folder name
- Handles selection and expansion

#### FileIconView
Displays an appropriate icon for a file based on its extension.
- Shows different icons for different file types

#### FolderIconView
Displays a folder icon.
- Shows open or closed state

### Terminal Components

#### TerminalInputView
Provides an input field for terminal commands.
- Handles command submission
- Manages command history

#### TerminalOutputView
Displays the output of terminal commands.
- Shows command output with appropriate formatting
- Handles special characters and ANSI codes

### Shared Components

#### SubmitButtonView
Button for submitting messages or commands.
- Shows appropriate icon
- Handles disabled state

#### StopButtonView
Button for stopping the agent.
- Shows stop icon
- Handles disabled state

#### ContinueButtonView
Button for continuing the conversation.
- Shows continue icon
- Appears when agent is waiting for user input

#### LoadingSpinnerView
Displays a loading animation.
- Shows animated spinner
- Adjustable size

#### ImageCarouselView
Displays a carousel of images.
- Shows multiple images
- Provides navigation between images
- Allows removal of images

#### UploadImageInputView
Button for uploading images.
- Opens file picker
- Handles image selection

## Component Relationships Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            MainView                                  │
│                                                                      │
│  ┌───────────────┐    ┌───────────────────┐    ┌───────────────┐    │
│  │FileExplorerView│    │ ChatInterfaceView │    │  TerminalView │    │
│  │               │    │                   │    │               │    │
│  │ ┌───────────┐ │    │  ┌─────────────┐  │    │ ┌───────────┐ │    │
│  │ │ExplorerTree│ │    │  │ MessagesView│  │    │ │TerminalInput│    │
│  │ └───────────┘ │    │  └─────────────┘  │    │ └───────────┘ │    │
│  │               │    │                   │    │               │    │
│  │ ┌───────────┐ │    │  ┌─────────────┐  │    │ ┌───────────┐ │    │
│  │ │ TreeNode  │ │    │  │InteractiveChat│    │ │TerminalOutput│   │
│  │ └───────────┘ │    │  │    BoxView   │  │    │ └───────────┘ │    │
│  └───────────────┘    │  └─────────────┘  │    └───────────────┘    │
│                       │                   │                          │
│                       │  ┌─────────────┐  │                          │
│                       │  │TypingIndicator│                          │
│                       │  └─────────────┘  │                          │
│                       │                   │                          │
│                       │  ┌─────────────┐  │                          │
│                       │  │ChatSuggestions│                          │
│                       │  └─────────────┘  │                          │
│                       └───────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │
                        ┌─────┴──────┐
                        │  AppState  │
                        └─────┬──────┘
                              │
                              │
                              ▼
                      ┌───────────────┐
                      │SocketIOService│
                      └───────────────┘
                              │
                              │
                              ▼
                      ┌───────────────┐
                      │  OpenHands    │
                      │    Server     │
                      └───────────────┘
```

## Data Flow

1. **User Interaction**:
   - User interacts with UI components (e.g., sends a message, clicks a file)
   - SwiftUI views call methods on AppState

2. **State Updates**:
   - AppState processes the user action
   - Updates relevant state properties
   - May call methods on SocketIOService to send data to server

3. **Server Communication**:
   - SocketIOService sends events to the server
   - Receives events from the server
   - Parses event data and notifies AppState

4. **UI Updates**:
   - AppState updates its published properties
   - SwiftUI views automatically update due to @Published property wrappers

## Implementation Considerations

1. **Socket.IO Integration**:
   - Use a Swift Socket.IO client library (e.g., SocketIO-Kit)
   - Handle reconnection logic gracefully
   - Implement proper error handling for network issues

2. **State Management**:
   - Use the MVVM pattern with ObservableObject for reactive updates
   - Keep state centralized in AppState to avoid duplication
   - Use dependency injection for services

3. **Performance**:
   - Implement pagination for large message histories
   - Use lazy loading for file explorer nodes
   - Optimize image handling for large images

4. **Error Handling**:
   - Implement comprehensive error handling for network issues
   - Provide clear error messages to users
   - Add retry mechanisms for failed operations

5. **Security**:
   - Implement secure storage for conversation IDs and credentials
   - Handle sensitive data appropriately
   - Validate all data received from the server

6. **Accessibility**:
   - Ensure all UI components are accessible
   - Provide appropriate labels for screen readers
   - Support keyboard navigation

7. **Testing**:
   - Implement unit tests for core logic
   - Create UI tests for critical user flows
   - Mock socket.io events for testing event handling