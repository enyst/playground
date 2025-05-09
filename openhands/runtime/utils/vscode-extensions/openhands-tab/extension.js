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

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'colorSelected':
                    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
                    break;
            }
        });
    }

    _getHtmlForWebview(webview) {
        // For now, a simple placeholder. We will enhance this later.
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>OpenHands</title>
            </head>
            <body>
                <h1>Welcome to OpenHands</h1>
                <p>This is your OpenHands tab content. We will build this out further.</p>
            </body>
            </html>`;
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
