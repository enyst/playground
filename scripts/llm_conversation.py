#!/usr/bin/env python3
"""LLM settings configuration and new conversation starter for OpenHands Cloud."""

import argparse
import os
import sys
from pathlib import Path
from typing import Optional

from cloud_api import OpenHandsCloudAPI
from jinja2 import Environment, FileSystemLoader


def configure_llm_settings(api_key: Optional[str] = None) -> None:
    """Configure LLM settings from repository secrets.

    Args:
        api_key: OpenHands API key (optional, will use env var if not provided)
    """
    print('Configuring LLM settings from repository secrets...')

    # Read LLM configuration from environment variables (repository secrets)
    llm_model = os.getenv('LLM_MODEL')
    llm_base_url = os.getenv('LLM_BASE_URL')
    llm_api_key = os.getenv('LLM_API_KEY')

    if not llm_model:
        print('Warning: LLM_MODEL not found in environment variables')
        return

    try:
        client = OpenHandsCloudAPI(api_key=api_key)
        response = client.store_llm_settings(
            llm_model=llm_model, llm_base_url=llm_base_url, llm_api_key=llm_api_key
        )
        print(f'✅ LLM settings configured successfully: {llm_model}')
        if llm_base_url:
            print(f'   Base URL: {llm_base_url}')
        print(f'   Response: {response}')

    except Exception as e:
        print(f'❌ Error configuring LLM settings: {e}')
        sys.exit(1)


def start_new_conversation(
    repository: Optional[str] = None,
    selected_branch: Optional[str] = None,
    api_key: Optional[str] = None,
    poll: bool = False,
) -> str:
    """Start a new conversation using the new_conversation.j2 template.

    Args:
        repository: Git repository name in format "owner/repo" (optional)
        selected_branch: Git branch to use (optional)
        api_key: OpenHands API key (optional, will use env var if not provided)
        poll: Whether to poll until conversation stops

    Returns:
        Conversation ID
    """
    print('Starting new conversation...')

    conversation_id = None
    github_token = os.getenv('GITHUB_TOKEN')

    # Load the prompt template
    script_dir = Path(__file__).parent
    prompts_dir = script_dir / 'prompts'

    if not (prompts_dir / 'new_conversation.j2').exists():
        print('❌ Error: new_conversation.j2 template not found')
        sys.exit(1)

    env = Environment(loader=FileSystemLoader(prompts_dir))
    template = env.get_template('new_conversation.j2')

    # Render the template (currently no variables, but ready for future expansion)
    initial_message = template.render()

    try:
        client = OpenHandsCloudAPI(api_key=api_key)
        response = client.create_conversation(
            initial_user_msg=initial_message,
            repository=repository,
            selected_branch=selected_branch,
        )

        conversation_id = response['conversation_id']
        conversation_link = f'https://app.all-hands.dev/conversations/{conversation_id}'

        print('✅ Conversation started successfully!')
        print(f'   Conversation ID: {conversation_id}')
        print(f'   Status: {response.get("status", "unknown")}')
        print(f'   Link: {conversation_link}')

        # Post success comment to GitHub issue
        if github_token:
            try:
                comment = f'Conversation started, see it here: {conversation_link}'
                client.post_github_comment(
                    'enyst/playground', 95, comment, github_token
                )
            except Exception as e:
                print(f'⚠️  Could not post to GitHub issue: {e}')

        if poll:
            print('\n🔄 Polling until conversation stops...')
            final_status = client.poll_until_stopped(conversation_id)
            print(
                f'✅ Conversation stopped with status: {final_status.get("status", "unknown")}'
            )

        return conversation_id

    except TimeoutError as e:
        print(f'⏰ Timeout: {e}')
        # Post timeout comment to GitHub issue
        if github_token and conversation_id:
            try:
                comment = 'Conversation timed out while polling'
                client.post_github_comment(
                    'enyst/playground', 95, comment, github_token
                )
            except Exception:
                pass  # Don't fail on comment posting
        sys.exit(1)

    except Exception as e:
        print(f'❌ Error starting conversation: {e}')
        # Post error comment to GitHub issue
        if github_token:
            try:
                comment = 'Got an error while starting conversation'
                client.post_github_comment(
                    'enyst/playground', 95, comment, github_token
                )
            except Exception:
                pass  # Don't fail on comment posting
        sys.exit(1)


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(
        description='Configure LLM settings and start new conversations with OpenHands Cloud'
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Configure LLM settings command
    config_parser = subparsers.add_parser(
        'configure-llm', help='Configure LLM settings from repository secrets'
    )
    config_parser.add_argument(
        '--api-key', help='OpenHands API key (defaults to OPENHANDS_API_KEY env var)'
    )

    # Start new conversation command
    convo_parser = subparsers.add_parser(
        'new-conversation',
        help='Start a new conversation using new_conversation.j2 template',
    )
    convo_parser.add_argument(
        '--repository', help="Git repository name in format 'owner/repo'"
    )
    convo_parser.add_argument('--branch', help='Git branch to use')
    convo_parser.add_argument(
        '--api-key', help='OpenHands API key (defaults to OPENHANDS_API_KEY env var)'
    )
    convo_parser.add_argument(
        '--poll', action='store_true', help='Poll until conversation stops'
    )

    # Combined command
    combined_parser = subparsers.add_parser(
        'configure-and-start',
        help='Configure LLM settings and start a new conversation',
    )
    combined_parser.add_argument(
        '--repository', help="Git repository name in format 'owner/repo'"
    )
    combined_parser.add_argument('--branch', help='Git branch to use')
    combined_parser.add_argument(
        '--api-key', help='OpenHands API key (defaults to OPENHANDS_API_KEY env var)'
    )
    combined_parser.add_argument(
        '--poll', action='store_true', help='Poll until conversation stops'
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == 'configure-llm':
        configure_llm_settings(api_key=args.api_key)

    elif args.command == 'new-conversation':
        start_new_conversation(
            repository=args.repository,
            selected_branch=args.branch,
            api_key=args.api_key,
            poll=args.poll,
        )

    elif args.command == 'configure-and-start':
        configure_llm_settings(api_key=args.api_key)
        start_new_conversation(
            repository=args.repository,
            selected_branch=args.branch,
            api_key=args.api_key,
            poll=args.poll,
        )


if __name__ == '__main__':
    main()
