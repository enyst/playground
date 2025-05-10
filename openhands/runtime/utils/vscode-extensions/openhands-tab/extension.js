const vscode = require('vscode');
const { io } = require("socket.io-client");
const http = require('http');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "openhands-tab-extension" is now active!');

    const provider = new OpenHandsViewProvider(context.extensionUri, context); // Pass context

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(OpenHandsViewProvider.viewType, provider)
    );
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}


class OpenHandsViewProvider {
    static viewType = 'openhandsView'; // Must match the id in package.json

    _view;
    _extensionUri;
    _socket = null;
    _conversationId = null;
    _SERVER_URL = 'http://localhost:3000'; // Make this configurable later if needed
    _context; // To store the extension context for disposables

    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context; // Store context
    }

    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            message => {
                if (!this._view) { 
                    return;
                }
                switch (message.type) {
                    case 'userPrompt':
                        this.handleUserPrompt(message.text);
                        return;
                }
            },
            undefined,
            this._context.subscriptions // Use stored context's subscriptions
        );
    }

    _getHtmlForWebview(webview) {
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
                <title>OpenHands</title>
                <style>
                    body { 
                        display: flex; 
                        flex-direction: column; 
                        height: 100vh; 
                        margin: 0; 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; 
                        background-color: var(--vscode-editor-background); 
                        color: var(--vscode-editor-foreground); 
                    }
                    #messages { 
                        flex-grow: 1; 
                        overflow-y: auto; 
                        padding: 10px; 
                        border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-editorGroup-border)); 
                    }
                    .message { 
                        margin-bottom: 8px; 
                        padding: 8px; 
                        border-radius: 4px; 
                        max-width: 80%;
                        word-wrap: break-word; /* Ensure long words break and wrap */
                    }
                    .user-message { 
                        background-color: var(--vscode-list-activeSelectionBackground); 
                        color: var(--vscode-list-activeSelectionForeground); 
                        align-self: flex-end; 
                        margin-left: auto; /* Push to the right */
                    }
                    .agent-message { 
                        background-color: var(--vscode-editorWidget-background); 
                        border: 1px solid var(--vscode-editorWidget-border, var(--vscode-contrastBorder)); 
                        align-self: flex-start;
                        margin-right: auto; /* Push to the left */
                    }
                    #input-area { 
                        display: flex; 
                        padding: 10px; 
                        border-top: 1px solid var(--vscode-sideBar-border, var(--vscode-editorGroup-border)); 
                        background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
                    }
                    #prompt-input { 
                        flex-grow: 1; 
                        margin-right: 10px; 
                        border: 1px solid var(--vscode-input-border); 
                        background-color: var(--vscode-input-background); 
                        color: var(--vscode-input-foreground); 
                        border-radius: 3px; 
                        padding: 6px; 
                        resize: none; /* Prevent manual resize */
                        font-family: inherit;
                    }
                    #prompt-input:focus { 
                        outline: 1px solid var(--vscode-focusBorder); 
                        border-color: var(--vscode-focusBorder); 
                    }
                    #send-button { 
                        background-color: var(--vscode-button-background); 
                        color: var(--vscode-button-foreground); 
                        border: none; 
                        padding: 0px 12px; /* Adjusted padding for height */
                        height: min-content; /* Adjust height to content */
                        align-self: center; /* Vertically center with textarea */
                        border-radius: 3px; 
                        cursor: pointer; 
                        line-height: 2; /* Ensure text is centered vertically */
                    }
                    #send-button:hover { 
                        background-color: var(--vscode-button-hoverBackground); 
                    }
                    pre {
                        white-space: pre-wrap;       /* Since CSS 2.1 */
                        white-space: -moz-pre-wrap;  /* Mozilla, since 1999 */
                        white-space: -pre-wrap;      /* Opera 4-6 */
                        white-space: -o-pre-wrap;    /* Opera 7 */
                        word-wrap: break-word;       /* Internet Explorer 5.5+ */
                    }
                </style>
            </head>
            <body>
                <div id="messages">
                    <!-- Chat messages will appear here -->
                </div>
                <div id="input-area">
                    <textarea id="prompt-input" rows="2" placeholder="Enter your prompt..."></textarea>
                    <button id="send-button">Send</button>
                </div>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    const messagesDiv = document.getElementById('messages');
                    const promptInput = document.getElementById('prompt-input');
                    const sendButton = document.getElementById('send-button');

                    function addMessage(text, sender) {
                        const msgContainer = document.createElement('div');
                        msgContainer.style.display = 'flex'; // Use flex to control alignment
                        if (sender === 'user') {
                            msgContainer.style.justifyContent = 'flex-end';
                        } else {
                            msgContainer.style.justifyContent = 'flex-start';
                        }
                        
                        const msgDiv = document.createElement('div');
                        msgDiv.classList.add('message');
                        msgDiv.classList.add(sender === 'user' ? 'user-message' : 'agent-message');
                        
                        // To handle markdown-like newlines and code blocks, we can set textContent
                        // and rely on <pre>-like styling for whitespace preservation.
                        // For more complex markdown, a library would be needed.
                        msgDiv.textContent = text;

                        msgContainer.appendChild(msgDiv);
                        messagesDiv.appendChild(msgContainer);
                        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
                    }

                    sendButton.addEventListener('click', () => {
                        const text = promptInput.value;
                        if (text.trim() === '') return;

                        addMessage(text, 'user');

                        vscode.postMessage({ type: 'userPrompt', text: text });
                        promptInput.value = ''; // Clear input
                        adjustTextareaHeight(); // Adjust height after clearing
                    });
                    
                    promptInput.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault(); 
                            sendButton.click();
                        }
                    });

                    // Auto-adjust textarea height
                    function adjustTextareaHeight() {
                        promptInput.style.height = 'auto'; // Reset height
                        let scrollHeight = promptInput.scrollHeight;
                        const maxHeight = 150; // Max height for 6-7 lines approx
                        if (scrollHeight > maxHeight) {
                            promptInput.style.height = maxHeight + 'px';
                            promptInput.style.overflowY = 'auto'; // Add scrollbar if max height exceeded
                        } else {
                            promptInput.style.height = scrollHeight + 'px';
                            promptInput.style.overflowY = 'hidden'; // Hide scrollbar if not needed
                        }
                    }

                    promptInput.addEventListener('input', adjustTextareaHeight);
                    adjustTextareaHeight(); // Initial adjustment

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data; 
                        if (message.type === 'agentResponse') {
                            let agentText = "Received an event from agent."; // Default message

                            if (typeof message.data === 'string') {
                                agentText = message.data;
                            } else if (typeof message.data === 'object' && message.data !== null) {
                                // Check for our custom status/error messages first
                                if (message.data.error === true && typeof message.data.message === 'string') {
                                    agentText = "ERROR: " + message.data.message;
                                } else if (message.data.type === 'status' && typeof message.data.message === 'string') {
                                    agentText = "STATUS: " + message.data.message;
                                } 
                                // Then check for OpenHands specific event structures
                                else if (message.data.action === 'message' && message.data.args && typeof message.data.args.content === 'string') {
                                    agentText = message.data.args.content;
                                } else if (message.data.action === 'think' && message.data.args && typeof message.data.args.thought === 'string') {
                                    // Optionally display thoughts, or just log them. For now, display.
                                    agentText = "[Thinking] " + message.data.args.thought;
                                } else if (message.data.observation && typeof message.data.content === 'string') { 
                                    // General observation with content (e.g. CmdOutputObservation)
                                    // Could be too verbose. For now, show it.
                                    agentText = "[Observation] " + message.data.observation + ": " + message.data.content;
                                } else if (typeof message.data.message === 'string') { // General message property (e.g. AgentStateChangedObservation)
                                    agentText = message.data.message;
                                } else if (typeof message.data.content === 'string') { // Fallback content property
                                    agentText = message.data.content;
                                } else {
                                    // Fallback for other complex objects
                                    try {
                                        // agentText = "Agent event: " + JSON.stringify(message.data, null, 2); // Might be too much
                                        agentText = "Received a complex event from agent. Check console for details.";
                                        console.log("Received agent event data:", message.data);
                                    } catch (e) {
                                        agentText = "Received unparseable complex object from agent.";
                                    }
                                }
                            }
                           addMessage(agentText, 'agent');
                        }
                    });
                </script>
            </body>
            </html>`;
    }

    // Helper to post messages to webview, simplifying agent responses
    postAgentResponseToWebview(data) {
        if (this._view && this._view.webview) {
            this._view.webview.postMessage({ type: 'agentResponse', data: data });
        } else {
            console.error('OpenHandsViewProvider: Webview not available to post message.');
        }
    }

    handleUserPrompt(text) {
        if (!this._conversationId) {
            this.initiateConversation(text);
        } else if (this._socket && this._socket.connected) {
            this.sendSocketMessage(text);
        } else {
            // Socket might have disconnected, or conversationId exists but socket is not yet connected.
            console.log('OpenHandsViewProvider: Socket not ready for prompt [%s...]. Attempting to (re)initiate or connect.', text.substring(0,50));
            this.initiateConversation(text); // This will handle different states internally.
        }
    }

    initiateConversation(initialPrompt) {
        // Case 1: Conversation ID exists and socket is ALREADY connected. Just send the message.
        if (this._conversationId && this._socket && this._socket.connected) {
             console.log('OpenHandsViewProvider: initiateConversation - Case 1: Convo ID exists, socket connected. Sending prompt via socket.');
             this.sendSocketMessage(initialPrompt);
             return;
        }

        // Case 2: Conversation ID exists, but socket is not connected or doesn't exist. Try to connect/reconnect socket.
        if (this._conversationId) { 
            console.log('OpenHandsViewProvider: initiateConversation - Case 2: Convo ID exists, socket not ready. Attempting to connect socket.');
            this.connectSocket(); // This will try to create/recreate and connect the socket.
            if (this._socket) {
                // Send the prompt once connected.
                this._socket.once('connect', () => {
                    console.log('OpenHandsViewProvider: Socket connected for existing convo ID. Sending initial prompt.');
                    this.sendSocketMessage(initialPrompt);
                });
                // If socket connection fails, connect_error handler in connectSocket should inform user.
            } else {
                 // This state (this._socket is null after connectSocket) should ideally not be reached if connectSocket behaves as expected.
                 console.error('OpenHandsViewProvider: CRITICAL - this._socket is null after calling connectSocket() for existing conversationId.');
                 this.postAgentResponseToWebview({ error: true, message: "Critical error: Failed to initialize socket for existing conversation." });
            }
            return;
        }
        
        // Case 3: No Conversation ID. This is a brand new conversation, requires HTTP POST.
        console.log('OpenHandsViewProvider: initiateConversation - Case 3: No Convo ID. Initiating new conversation via HTTP POST.');
        const postData = JSON.stringify({ initial_user_msg: initialPrompt });
        const serverUrl = new URL(this._SERVER_URL);
        const options = {
            hostname: serverUrl.hostname,
            port: serverUrl.port || (serverUrl.protocol === 'https:' ? 443 : 80),
            path: '/api/conversations',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        this.postAgentResponseToWebview({ type: 'status', message: 'Initializing new conversation...' });

        const req = http.request(options, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const response = JSON.parse(responseBody);
                        if (response.conversation_id) {
                            this._conversationId = response.conversation_id;
                            console.log('OpenHandsViewProvider: New conversation initiated via HTTP, ID:', this._conversationId);
                            this.postAgentResponseToWebview({ type: 'status', message: 'Conversation initialized. Connecting to agent...' });
                            this.connectSocket(); // Now connect the socket for the new conversationId

                            if (this._socket) {
                                // Send the initial message once socket is connected for the new conversation.
                                this._socket.once('connect', () => {
                                    console.log('OpenHandsViewProvider: Socket connected for new conversation, sending initial prompt.');
                                    this.sendSocketMessage(initialPrompt);
                                });
                            }
                        } else {
                            throw new Error('Invalid API response from /api/conversations: conversation_id missing.');
                        }
                    } catch (e) {
                        console.error('OpenHandsViewProvider: Error parsing /api/conversations response:', e.message, responseBody);
                        this.postAgentResponseToWebview({ error: true, message: 'Failed to parse server response for new conversation. ' + e.message });
                    }
                } else {
                    console.error('OpenHandsViewProvider: /api/conversations request failed. Status:', res.statusCode, 'Body:', responseBody);
                    this.postAgentResponseToWebview({ error: true, message: `Server error (${res.statusCode}) creating new conversation. Details: ${responseBody}` });
                }
            });
        });

        req.on('error', (e) => {
            console.error('OpenHandsViewProvider: HTTP request error for /api/conversations:', e);
            this.postAgentResponseToWebview({ error: true, message: 'Network error: Could not connect to OpenHands server to create conversation. ' + e.message });
        });

        req.write(postData);
        req.end();
    }

    connectSocket() {
        if (this._socket && this._socket.connected) {
            // If we are trying to connect for the *same* conversationId, and it's already connected, do nothing.
            if (this._socket.io.opts.query.conversation_id === this._conversationId) {
                 console.log('OpenHandsViewProvider: connectSocket - Socket already connected for this conversationId.');
                 return;
            }
            // If conversationId has changed, or socket exists but not for current ID we need to disconnect the old one and connect new.
            console.log('OpenHandsViewProvider: connectSocket - conversationId changed or socket exists for different/no ID. Reconnecting.');
            this._socket.disconnect();
            this._socket.removeAllListeners();
            this._socket = null; // Ensure we create a new instance below
        }
        
        // If socket exists but is not connected (could be from a failed previous attempt for the *same* conversationId)
        // ensure it's cleaned up before creating a new one to avoid multiple instances for the same ID.
        if (this._socket && !this._socket.connected) {
            console.log('OpenHandsViewProvider: connectSocket - Existing socket found but not connected. Disconnecting and cleaning up.');
            this._socket.disconnect();
            this._socket.removeAllListeners();
            this._socket = null;
        }

        if (!this._conversationId) {
            console.error('OpenHandsViewProvider: connectSocket - Cannot connect socket without a conversationId.');
            this.postAgentResponseToWebview({ error: true, message: 'Error: Missing conversation ID for agent connection.'});
            return;
        }
        
        const serverAddress = this._SERVER_URL;
        console.log(`OpenHandsViewProvider: Attempting to connect Socket.IO to ${serverAddress} for conversation ${this._conversationId}`);

        this._socket = io(serverAddress, {
            query: {
                conversation_id: this._conversationId,
                latest_event_id: -1, // Required by OpenHands server
            },
            transports: ['websocket'], // Prefer WebSocket for direct connection
            reconnectionAttempts: 3,    // Example: Limit auto-reconnection attempts
            timeout: 10000,             // Connection timeout in ms (e.g., 10 seconds)
            autoConnect: true,          // Explicitly autoConnect, though default is true
        });

        // Standard operational listeners
        this._socket.on('connect', () => {
            console.log('OpenHandsViewProvider: Socket.IO connected successfully. Socket ID:', this._socket.id);
            this.postAgentResponseToWebview({ type: 'status', message: 'Agent connected.' });
        });

        this._socket.on('oh_event', (data) => {
            // console.log('OpenHandsViewProvider: Received oh_event:', data); // Can be very verbose
            this.postAgentResponseToWebview(data); // Forward complete data object to webview
        });

        this._socket.on('disconnect', (reason) => {
            console.log('OpenHandsViewProvider: Socket.IO disconnected. Reason:', reason);
            this.postAgentResponseToWebview({ type: 'status', message: `Agent disconnected: ${reason}.` });
            // If disconnect was not clean (e.g. server-side), the client might attempt auto-reconnect based on options.
            // For permanent failures or specific reasons, might need to reset _socket and _conversationId and notify user to start new chat.
        });

        // Error handling listeners
        this._socket.on('error', (error) => {
            console.error('OpenHandsViewProvider: Socket.IO general error event:', error);
            this.postAgentResponseToWebview({ error: true, message: `Agent connection error: ${error.message || String(error)}` });
        });
        
        this._socket.on('connect_error', (error) => {
            console.error('OpenHandsViewProvider: Socket.IO connection establishment error:', error);
            this.postAgentResponseToWebview({ error: true, message: `Failed to connect to agent: ${error.message || String(error)}` });
            // After a connect_error, the socket might not automatically retry depending on configuration.
            // Consider if this._socket should be nulled here to allow fresh connection attempts via initiateConversation.
        });

        // Optional: handle other detailed error events if needed for debugging
        // this._socket.on('connect_timeout', (timeout) => { ... });
        // this._socket.on('reconnect_attempt', (attemptNumber) => { ... });
        // this._socket.on('reconnect_error', (error) => { ... });
        // this._socket.on('reconnect_failed', () => { ... });
    }

    sendSocketMessage(promptText) {
        if (!this._socket || !this._socket.connected) {
            console.warn('OpenHandsViewProvider: sendSocketMessage - Socket not connected. Prompt: [%s...]', promptText.substring(0,50));
            this.postAgentResponseToWebview({ error: true, message: 'Agent not connected. Attempting to send/reconnect...' });
            
            if(this._conversationId) {
                console.log('OpenHandsViewProvider: sendSocketMessage - Attempting to ensure socket is connected for existing conversationId.');
                // Ensure a connection attempt is made. connectSocket() handles existing/new connections.
                this.connectSocket(); 
                
                if (this._socket) { 
                    // If connectSocket() immediately connected or it was already connected and now this._socket is valid and connected:
                    if (this._socket.connected) {
                        const payload = { action: 'message', args: { content: promptText, image_urls: [] } };
                        console.log('OpenHandsViewProvider: sendSocketMessage - Socket was/became connected. Sending oh_user_action immediately.', payload);
                        this._socket.emit('oh_user_action', payload);
                    } else {
                        // If socket is still not connected (e.g., connectSocket is async or connection is in progress),
                        // queue the message by attaching a one-time 'connect' listener.
                        console.log('OpenHandsViewProvider: sendSocketMessage - Socket not immediately connected. Queuing message to send on connect.');
                        this._socket.once('connect', () => {
                            console.log('OpenHandsViewProvider: sendSocketMessage - Socket connected (queued). Sending message: [%s...]', promptText.substring(0,50));
                            const payload = { action: 'message', args: { content: promptText, image_urls: [] } };
                            this._socket.emit('oh_user_action', payload);
                        });
                    }
                } else {
                     console.error('OpenHandsViewProvider: sendSocketMessage - CRITICAL: this._socket is null after calling connectSocket(). Cannot queue message.');
                }
            } else {
                console.error('OpenHandsViewProvider: sendSocketMessage - Cannot send message as no conversationId exists to establish connection.');
                this.postAgentResponseToWebview({ error: true, message: 'Cannot send message: No active conversation. Please start a new one.' });
            }
            return; 
        }

        // Socket is connected and ready, send the message directly.
        const payload = {
            action: 'message',
            args: {
                content: promptText,
                image_urls: [], // Future: support image URLs if needed
            },
        };
        console.log('OpenHandsViewProvider: sendSocketMessage - Socket connected. Sending oh_user_action:', payload);
        this._socket.emit('oh_user_action', payload);
    }

}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
