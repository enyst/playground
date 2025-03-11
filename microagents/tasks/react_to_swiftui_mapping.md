# React to SwiftUI Component Mapping

This document provides a mapping between React components in the OpenHands web frontend and their corresponding SwiftUI views for the Mac client implementation. The goal is to maintain similar naming conventions for easier debugging and maintenance.

## Table of Contents

- [Chat Components](#chat-components)
- [File Explorer Components](#file-explorer-components)
- [Terminal Components](#terminal-components)
- [Conversation Panel Components](#conversation-panel-components)
- [Layout Components](#layout-components)
- [Shared Components](#shared-components)

## Chat Components

### Component: ChatInterface

- **Purpose**: Main container for the chat functionality, manages messages, user input, and agent state.
- **Important Props/State**: 
  - `messages`: Array of chat messages
  - `curAgentState`: Current state of the agent
  - `send`: Function to send messages to the backend
- **Interactive Elements**: 
  - Message input field
  - Stop button
  - Continue button
  - Feedback buttons
- **Socket Events**: 
  - Sends chat messages via WebSocket
  - Listens for agent state changes
- **Nested Components**: 
  - `InteractiveChatBox`
  - `Messages`
  - `ChatSuggestions`
  - `ActionSuggestions`
  - `TrajectoryActions`
  - `TypingIndicator`
  - `ScrollToBottomButton`
- **Suggested SwiftUI View Name**: `ChatInterfaceView`

### Component: InteractiveChatBox

- **Purpose**: Combines chat input with image upload functionality.
- **Important Props/State**: 
  - `onSubmit`: Function to handle message submission
  - `onStop`: Function to stop the agent
  - `isDisabled`: Whether the input is disabled
  - `mode`: "submit" or "stop" mode
- **Interactive Elements**: 
  - Text input field
  - Submit/Stop button
  - Image upload button
- **Nested Components**: 
  - `ChatInput`
  - `UploadImageInput`
  - `ImageCarousel`
- **Suggested SwiftUI View Name**: `InteractiveChatBoxView`

### Component: ChatInput

- **Purpose**: Text input component for entering chat messages.
- **Important Props/State**: 
  - `onSubmit`: Function to handle message submission
  - `onStop`: Function to stop the agent
  - `disabled`: Whether the input is disabled
  - `button`: "submit" or "stop" button type
- **Interactive Elements**: 
  - Text input field (TextareaAutosize)
  - Submit/Stop button
- **Socket Events**: None directly
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ChatInputView`

### Component: Messages

- **Purpose**: Renders a list of chat messages.
- **Important Props/State**: 
  - `messages`: Array of message objects
  - `isAwaitingUserConfirmation`: Boolean indicating if waiting for user confirmation
- **Interactive Elements**: None directly
- **Socket Events**: None directly
- **Nested Components**: 
  - `ChatMessage`
  - `ExpandableMessage`
  - `ConfirmationButtons`
  - `ImageCarousel`
- **Suggested SwiftUI View Name**: `MessagesView`

### Component: ChatMessage

- **Purpose**: Renders an individual chat message with styling based on sender type.
- **Important Props/State**: 
  - `type`: Message sender type (user/assistant)
  - `message`: Message content
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ChatMessageView`

### Component: ExpandableMessage

- **Purpose**: Message component that can be expanded to show more content.
- **Important Props/State**: 
  - `type`: Message type (error/action)
  - `message`: Message content
  - `success`: Whether the action was successful
- **Interactive Elements**: Expand/collapse button
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ExpandableMessageView`

### Component: TypingIndicator

- **Purpose**: Shows an animation indicating the agent is typing.
- **Important Props/State**: None
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `TypingIndicatorView`

### Component: ChatSuggestions

- **Purpose**: Displays suggested queries for the user.
- **Important Props/State**: 
  - `onSuggestionsClick`: Function to handle when a suggestion is clicked
- **Interactive Elements**: Clickable suggestion buttons
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ChatSuggestionsView`

### Component: ActionSuggestions

- **Purpose**: Displays suggested actions for the user.
- **Important Props/State**: 
  - `onSuggestionsClick`: Function to handle when a suggestion is clicked
- **Interactive Elements**: Clickable suggestion buttons
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ActionSuggestionsView`

## File Explorer Components

### Component: FileExplorer

- **Purpose**: Displays a file tree of the workspace files.
- **Important Props/State**: 
  - `isOpen`: Whether the explorer is expanded
  - `onToggle`: Function to toggle the explorer
- **Interactive Elements**: 
  - Toggle button
  - Refresh button
  - VSCode open button
- **Socket Events**: None directly
- **Nested Components**: 
  - `FileExplorerHeader`
  - `ExplorerTree`
  - `BrandButton`
- **Suggested SwiftUI View Name**: `FileExplorerView`

### Component: ExplorerTree

- **Purpose**: Renders a hierarchical tree of files and folders.
- **Important Props/State**: 
  - `files`: Array of file/folder objects
- **Interactive Elements**: Clickable file/folder items
- **Socket Events**: None
- **Nested Components**: 
  - `TreeNode`
- **Suggested SwiftUI View Name**: `ExplorerTreeView`

### Component: TreeNode

- **Purpose**: Renders a single node in the file explorer tree.
- **Important Props/State**: 
  - `node`: File/folder data
  - `level`: Nesting level
- **Interactive Elements**: 
  - Expand/collapse button for folders
  - Click to select file
- **Socket Events**: None
- **Nested Components**: 
  - `FileIcon`
  - `FolderIcon`
  - `Filename`
- **Suggested SwiftUI View Name**: `TreeNodeView`

### Component: FileExplorerHeader

- **Purpose**: Header for the file explorer with controls.
- **Important Props/State**: 
  - `isOpen`: Whether the explorer is expanded
  - `onToggle`: Function to toggle the explorer
  - `onRefreshWorkspace`: Function to refresh the file list
- **Interactive Elements**: 
  - Toggle button
  - Refresh button
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `FileExplorerHeaderView`

### Component: FileIcon

- **Purpose**: Displays an appropriate icon for a file based on its extension.
- **Important Props/State**: 
  - `filename`: Name of the file
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `FileIconView`

### Component: FolderIcon

- **Purpose**: Displays a folder icon.
- **Important Props/State**: 
  - `isOpen`: Whether the folder is expanded
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `FolderIconView`

### Component: Filename

- **Purpose**: Displays a filename with appropriate styling.
- **Important Props/State**: 
  - `name`: Name of the file
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `FilenameView`

## Terminal Components

### Component: Terminal

- **Purpose**: Displays a terminal interface for command execution.
- **Important Props/State**: 
  - `commands`: Array of commands
  - `secrets`: Array of secret strings to mask in output
  - `disabled`: Whether the terminal is disabled
- **Interactive Elements**: Interactive terminal input
- **Socket Events**: Likely communicates with backend for command execution
- **Nested Components**: None (uses xterm.js)
- **Suggested SwiftUI View Name**: `TerminalView`

## Conversation Panel Components

### Component: ConversationPanel

- **Purpose**: Displays a list of user conversations.
- **Important Props/State**: 
  - `onClose`: Function to close the panel
- **Interactive Elements**: 
  - Clickable conversation cards
  - Delete conversation button
- **Socket Events**: None directly
- **Nested Components**: 
  - `ConversationCard`
  - `ConfirmDeleteModal`
  - `ExitConversationModal`
- **Suggested SwiftUI View Name**: `ConversationPanelView`

### Component: ConversationCard

- **Purpose**: Displays information about a single conversation.
- **Important Props/State**: 
  - `title`: Conversation title
  - `isActive`: Whether this is the active conversation
  - `onDelete`: Function to delete the conversation
  - `onChangeTitle`: Function to change the conversation title
  - `status`: Conversation status
- **Interactive Elements**: 
  - Delete button
  - Edit title button
- **Socket Events**: None
- **Nested Components**: 
  - `ConversationStateIndicator`
- **Suggested SwiftUI View Name**: `ConversationCardView`

### Component: ConversationStateIndicator

- **Purpose**: Visual indicator of conversation state.
- **Important Props/State**: 
  - `status`: Conversation status
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ConversationStateIndicatorView`

## Layout Components

### Component: ResizablePanel

- **Purpose**: A panel that can be resized by dragging a divider.
- **Important Props/State**: 
  - `firstChild`: Content for the first panel
  - `secondChild`: Content for the second panel
  - `orientation`: Horizontal or vertical orientation
  - `initialSize`: Initial size of the first panel
- **Interactive Elements**: 
  - Draggable divider
  - Collapse/expand buttons
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ResizablePanelView`

### Component: Container

- **Purpose**: Container component with consistent styling.
- **Important Props/State**: 
  - `children`: Child components
  - `className`: Additional CSS classes
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ContainerView`

### Component: BetaBadge

- **Purpose**: Displays a "Beta" badge.
- **Important Props/State**: None
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `BetaBadgeView`

## Shared Components

### Component: SubmitButton

- **Purpose**: Button for submitting messages or forms.
- **Important Props/State**: 
  - `isDisabled`: Whether the button is disabled
  - `onClick`: Function to call when clicked
- **Interactive Elements**: Button click
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `SubmitButtonView`

### Component: StopButton

- **Purpose**: Button for stopping the agent.
- **Important Props/State**: 
  - `isDisabled`: Whether the button is disabled
  - `onClick`: Function to call when clicked
- **Interactive Elements**: Button click
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `StopButtonView`

### Component: ContinueButton

- **Purpose**: Button for continuing the conversation.
- **Important Props/State**: 
  - `onClick`: Function to call when clicked
- **Interactive Elements**: Button click
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ContinueButtonView`

### Component: ScrollToBottomButton

- **Purpose**: Button to scroll the chat to the bottom.
- **Important Props/State**: 
  - `onClick`: Function to call when clicked
- **Interactive Elements**: Button click
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ScrollToBottomButtonView`

### Component: ConfirmationButtons

- **Purpose**: Yes/No confirmation buttons.
- **Important Props/State**: None directly (likely uses context)
- **Interactive Elements**: Yes and No buttons
- **Socket Events**: None directly
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ConfirmationButtonsView`

### Component: LoadingSpinner

- **Purpose**: Displays a loading animation.
- **Important Props/State**: 
  - `size`: Size of the spinner
- **Interactive Elements**: None
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `LoadingSpinnerView`

### Component: ImageCarousel

- **Purpose**: Displays a carousel of images.
- **Important Props/State**: 
  - `images`: Array of image URLs
  - `size`: Size of the carousel
  - `onRemove`: Function to remove an image
- **Interactive Elements**: 
  - Navigation buttons
  - Remove image button
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `ImageCarouselView`

### Component: UploadImageInput

- **Purpose**: Button for uploading images.
- **Important Props/State**: 
  - `onUpload`: Function to handle uploaded files
- **Interactive Elements**: Upload button and file picker
- **Socket Events**: None
- **Nested Components**: None
- **Suggested SwiftUI View Name**: `UploadImageInputView`

### Component: ServedApp

- **Purpose**: Displays an iframe with a served application.
- **Important Props/State**: 
  - `activeHost`: Current active host URL
- **Interactive Elements**: 
  - Refresh button
  - Open in new tab button
  - Home button
  - URL input field
- **Socket Events**: None directly
- **Nested Components**: 
  - `PathForm`
- **Suggested SwiftUI View Name**: `ServedAppView`