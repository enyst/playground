from litellm import ChatCompletionToolParam, ChatCompletionToolParamFunctionChunk

# Adapted descriptions, incorporating 1-indexed line info where relevant
_VIEW_FILE_DESCRIPTION = """Views the content of a file or lists a directory.
* If `path` is a file, displays the content with 1-indexed line numbers. These line numbers are for reference and NOT part of the actual file content.
  Example output for a file:
  1\tactual first line of file
  2\tactual second line of file
* If `path` is a directory, lists non-hidden files and directories up to 2 levels deep.
* If `view_range` is provided for a file, only that range of lines (1-indexed) is shown. E.g., [10, 20] shows lines 10 to 20. [-1] can be used to show the last line, [5, -1] from line 5 to end.
* Long outputs may be truncated and marked with `<response clipped>`."""

_CREATE_FILE_DESCRIPTION = """Creates a new file with the given text content.
* The `create` command cannot be used if the specified `path` already exists as a file.
* Always use absolute file paths (starting with /).
* Verify the parent directory exists and is the correct location using the `view_file` tool before creating a new file."""

_REPLACE_IN_FILE_DESCRIPTION = """Replaces an existing string (old_str) with a new string (new_str) in the specified file.
* CRITICAL: `old_str` must EXACTLY match one or more consecutive lines from the file, including all whitespace and indentation.
* `old_str` must be unique in the file; include sufficient context (3-5 lines recommended) if necessary.
* `new_str` is the content that will replace `old_str`.
* Line numbers are 1-indexed for understanding file context (e.g., via `view_file`), but are NOT part of `old_str` or `new_str`.
* Always use absolute file paths (starting with /)."""

_INSERT_IN_FILE_DESCRIPTION = """Inserts a string (new_str) into a file AFTER a specific line number (insert_line).
* `insert_line` is 1-indexed. The `new_str` will be inserted after this line. To insert at the beginning of the file, use `insert_line=0`.
* `new_str` is the content to insert.
* Always use absolute file paths (starting with /)."""

_UNDO_EDIT_DESCRIPTION = """Reverts the last edit made to the file at `path`.
* Always use absolute file paths (starting with /)."""

def create_view_file_tool() -> ChatCompletionToolParam:
    return ChatCompletionToolParam(
        type='function',
        function=ChatCompletionToolParamFunctionChunk(
            name='view_file',
            description=_VIEW_FILE_DESCRIPTION,
            parameters={
                'type': 'object',
                'properties': {
                    'path': {
                        'description': 'Absolute path to file or directory, e.g. `/workspace/file.py` or `/workspace`.',
                        'type': 'string',
                    },
                    'view_range': {
                        'description': 'Optional. For files, specifies a 1-indexed line number range to view, e.g., [11, 12] or [5, -1].',
                        'items': {'type': 'integer'},
                        'type': 'array',
                    },
                },
                'required': ['path'],
            },
        ),
    )

def create_create_file_tool() -> ChatCompletionToolParam:
    return ChatCompletionToolParam(
        type='function',
        function=ChatCompletionToolParamFunctionChunk(
            name='create_file',
            description=_CREATE_FILE_DESCRIPTION,
            parameters={
                'type': 'object',
                'properties': {
                    'path': {
                        'description': 'Absolute path to the file to be created, e.g. `/workspace/new_file.py`.',
                        'type': 'string',
                    },
                    'file_text': {
                        'description': 'The content to write into the new file.',
                        'type': 'string',
                    },
                },
                'required': ['path', 'file_text'],
            },
        ),
    )

def create_replace_in_file_tool() -> ChatCompletionToolParam:
    return ChatCompletionToolParam(
        type='function',
        function=ChatCompletionToolParamFunctionChunk(
            name='replace_in_file',
            description=_REPLACE_IN_FILE_DESCRIPTION,
            parameters={
                'type': 'object',
                'properties': {
                    'path': {
                        'description': 'Absolute path to the file to be edited, e.g. `/workspace/file.py`.',
                        'type': 'string',
                    },
                    'old_str': {
                        'description': 'The exact string/lines to search for and replace.',
                        'type': 'string',
                    },
                    'new_str': {
                        'description': 'The new string/lines to replace old_str with.',
                        'type': 'string',
                    },
                },
                'required': ['path', 'old_str', 'new_str'],
            },
        ),
    )

def create_insert_in_file_tool() -> ChatCompletionToolParam:
    return ChatCompletionToolParam(
        type='function',
        function=ChatCompletionToolParamFunctionChunk(
            name='insert_in_file',
            description=_INSERT_IN_FILE_DESCRIPTION,
            parameters={
                'type': 'object',
                'properties': {
                    'path': {
                        'description': 'Absolute path to the file to be edited, e.g. `/workspace/file.py`.',
                        'type': 'string',
                    },
                    'new_str': {
                        'description': 'The string/lines to insert.',
                        'type': 'string',
                    },
                    'insert_line': {
                        'description': '1-indexed line number AFTER which new_str will be inserted. Use 0 to insert at the beginning.',
                        'type': 'integer',
                    },
                },
                'required': ['path', 'new_str', 'insert_line'],
            },
        ),
    )

def create_undo_edit_tool() -> ChatCompletionToolParam:
    return ChatCompletionToolParam(
        type='function',
        function=ChatCompletionToolParamFunctionChunk(
            name='undo_file_edit', # Renamed to avoid potential clash if a generic 'undo' tool existed
            description=_UNDO_EDIT_DESCRIPTION,
            parameters={
                'type': 'object',
                'properties': {
                    'path': {
                        'description': 'Absolute path to the file for which the last edit should be undone.',
                        'type': 'string',
                    },
                },
                'required': ['path'],
            },
        ),
    )
