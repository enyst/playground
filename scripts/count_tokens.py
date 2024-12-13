#!/usr/bin/env python3
"""Script to count tokens in a file using Anthropic's API."""

import argparse
import anthropic
import os
import sys


def count_tokens_in_file(file_path: str, api_key: str, model: str) -> int:
    """Count tokens in a file using Anthropic's API.
    
    Args:
        file_path: Path to the file to count tokens in
        api_key: Anthropic API key
        model: Model name (e.g., "claude-3-haiku-20241022")
        
    Returns:
        Number of tokens in the file
    """
    # Read the entire file as one message
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Create simple message structure
    messages = [
        {'role': 'user', 'content': content}
    ]
    
    # Use the API to count tokens
    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.beta.messages.count_tokens(
            model=model,
            messages=messages,
        )
        return response.input_tokens
    except Exception as e:
        print(f"Error counting tokens: {e}", file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser(description="Count tokens in a file using Anthropic's API")
    parser.add_argument('file', help='File to count tokens in')
    parser.add_argument('--model', default='claude-3-haiku-20241022',
                      help='Model to use for counting (default: claude-3-haiku-20241022)')
    parser.add_argument('--api-key', help='Anthropic API key (can also use ANTHROPIC_API_KEY env var)')
    args = parser.parse_args()
    
    # Get API key from args or environment
    api_key = args.api_key or os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("Error: No API key provided. Use --api-key or set ANTHROPIC_API_KEY environment variable.",
              file=sys.stderr)
        sys.exit(1)
    
    try:
        token_count = count_tokens_in_file(args.file, api_key, args.model)
        print(f"Token count: {token_count}")
    except Exception as e:
        sys.exit(1)


if __name__ == '__main__':
    main()