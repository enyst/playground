const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "openhands-tab-extension" is now active!');

    const provider = new OpenHandsViewProvider(context.extensionUri);

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

    constructor(extensionUri) {
        this._extensionUri = extensionUri;
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
                if (!this._view) { // Check if view is still valid
                    return;
                }
                switch (message.type) {
                    case 'userPrompt':
                        // Echo back to the webview for now
                        this._view.webview.postMessage({ type: 'agentResponse', text: "Echo: " + message.text });
                        
                        // Optionally, show an info message in VS Code itself (for debugging/confirmation)
                        // vscode.window.showInformationMessage(`Received prompt: ${message.text}`);
                        return;
                }
            },
            undefined,
            context.subscriptions // Pass subscriptions for disposable management
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
                           addMessage(message.text, 'agent');
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
