# OpenHands Server Socket.IO API

This document outlines the Socket.IO API used by the OpenHands server for communication with clients.

## Events Emitted by Server (Server to Client)

### Event: 'oh_event'
- **Data Structure**: 
  ```typescript
  {
    id: number;                   // Event ID
    timestamp: string;            // ISO 8601 timestamp
    source: "agent" | "user";     // Source of the event
    message: string;              // Human-readable message
    cause?: number;               // ID of the event that caused this event (for observations)
    
    // For actions
    action?: string;              // Type of action (e.g., "message", "run", "read", etc.)
    args?: Record<string, unknown>; // Action-specific arguments
    
    // For observations
    observation?: string;         // Type of observation
    content?: string;             // Content of the observation
    extras?: Record<string, unknown>; // Observation-specific extra data
  }
  ```
- **Purpose**: Delivers events from the server to the client, including agent actions, observations, and state changes.

#### Common Event Types:

1. **Agent Message**
   - `action: "message"`
   - `source: "agent"`
   - `args`: Contains `thought`, `image_urls`, and `wait_for_response`

2. **Command Output**
   - `observation: "run"`
   - `content`: Command output text
   - `extras`: Contains `command`, `metadata` (with exit code, etc.)

3. **File Read Result**
   - `observation: "read"`
   - `content`: File content
   - `extras`: Contains `path` and `impl_source`

4. **File Write Result**
   - `observation: "write"`
   - `extras`: Contains `path` and `content`

5. **File Edit Result**
   - `observation: "edit"`
   - `extras`: Contains `path`, `diff`, and `impl_source`

6. **Browser Output**
   - `observation: "browse"`
   - `extras`: Contains browser state including `url`, `screenshot`, `dom_object`, etc.

7. **Agent State Change**
   - `observation: "agent_state_changed"`
   - `extras`: Contains `agent_state`

8. **Error**
   - `observation: "error"`
   - `extras`: May contain `error_id`

## Events Listened by Server (Client to Server)

### Event: 'oh_action'
- **Data Structure**:
  ```typescript
  {
    action: string;               // Type of action
    args: Record<string, unknown>; // Action-specific arguments
  }
  ```
- **Purpose**: Receives actions from the client to be processed by the server.

#### Common Action Types:

1. **User Message**
   - `action: "message"`
   - `source: "user"`
   - `args`: Contains `content` and optional `image_urls`

2. **Command Execution**
   - `action: "run"`
   - `args`: Contains `command`, `security_risk`, `confirmation_state`, and `thought`

3. **File Operations**
   - `action: "read"` - Read a file
   - `action: "write"` - Write to a file
   - `action: "edit"` - Edit a file
   - `args`: Contains operation-specific parameters like `path`, `content`, etc.

4. **Browser Actions**
   - `action: "browse"` - Navigate to URL
   - `action: "browse_interactive"` - Interact with browser
   - `args`: Contains browser-specific parameters

### Event: 'connect'
- **Data Structure**: Connection parameters in query string
  - `conversation_id`: ID of the conversation to join
  - `latest_event_id`: ID of the latest event received by the client
- **Purpose**: Establishes a connection to the server and joins a conversation.

### Event: 'disconnect'
- **Data Structure**: None
- **Purpose**: Notifies the server when a client disconnects.

## Connection Flow

1. Client connects with `conversation_id` and `latest_event_id` in query parameters
2. Server validates the conversation and user
3. Server sends events that occurred after `latest_event_id`
4. Client sends actions via `oh_action` events
5. Server processes actions and emits observations via `oh_event`

## Error Handling

- Connection errors may include error messages and data with a `msg_id` field
- Common error scenarios:
  - Missing conversation ID
  - Invalid conversation ID or user
  - Missing settings