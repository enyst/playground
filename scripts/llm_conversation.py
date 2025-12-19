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
        client.store_llm_settings(
            llm_model=llm_model, llm_base_url=llm_base_url, llm_api_key=llm_api_key
        )
        print(f'✅ LLM settings configured successfully: {llm_model}')
        if llm_base_url:
            print(f'   Base URL: {llm_base_url}')
    except Exception as e:
        print(f'❌ Error configuring LLM settings: {e}')
        sys.exit(1)


def start_new_conversation(
    repository: Optional[str] = None,
    selected_branch: Optional[str] = None,
    api_key: Optional[str] = None,
    poll: bool = False,
    prompt_file: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    comment_repo: Optional[str] = None,
    comment_issue: Optional[int] = None,
) -> str:
    """Start a new conversation with customizable prompts.

    Args:
        repository: Git repository name in format "owner/repo" (optional)
        selected_branch: Git branch to use (optional)
        api_key: OpenHands API key (optional, will use env var if not provided)
        poll: Whether to poll until conversation stops
        prompt_file: Prompt template file to use (optional, defaults to new_conversation.j2)
        custom_prompt: Custom prompt text (optional, overrides prompt_file)
        comment_repo: Repository to comment on in format "owner/repo" (optional)
        comment_issue: Issue/PR number to comment on (optional)

    Returns:
        Conversation ID
    """
    print('Starting new conversation...')

    conversation_id = None
    client = None
    github_token = os.getenv('GITHUB_TOKEN')

    # Determine the prompt to use
    if custom_prompt:
        # Use custom prompt directly
        initial_message = custom_prompt
        print(f'Using custom prompt: {custom_prompt[:50]}...')
    else:
        # Use prompt file (default to new_conversation.j2)
        if not prompt_file:
            prompt_file = 'new_conversation.j2'

        script_dir = Path(__file__).parent
        prompts_dir = script_dir / 'prompts'
        prompt_path = prompts_dir / prompt_file

        if not prompt_path.exists():
            print(f'❌ Error: Prompt file {prompt_file} not found in {prompts_dir}')
            sys.exit(1)

        env = Environment(loader=FileSystemLoader(prompts_dir))
        template = env.get_template(prompt_file)

        # Render the template (currently no variables, but ready for future expansion)
        initial_message = template.render()
        print(f'Using prompt file: {prompt_file}')

    try:
        client = OpenHandsCloudAPI(api_key=api_key)
        response = client.create_conversation(
            initial_user_msg=initial_message,
            repository=repository,
            selected_branch=selected_branch,
        )

        conversation_id = response['conversation_id']
        conversation_link = f'{client.base_url}/conversations/{conversation_id}'

        print('✅ Conversation started successfully!')
        print(f'   Conversation ID: {conversation_id}')
        print(f'   Status: {response.get("status", "unknown")}')
        print(f'   Link: {conversation_link}')

        # Post success comment to GitHub issue (only if explicitly requested)
        if github_token and comment_repo and comment_issue is not None:
            try:
                comment = f'Conversation started, see it [here]({conversation_link})'
                client.post_github_comment(
                    comment_repo, int(comment_issue), comment, github_token
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
        # Post timeout comment to GitHub issue (only if explicitly requested)
        if (
            github_token
            and conversation_id
            and client
            and comment_repo
            and comment_issue is not None
        ):
            try:
                comment = 'Conversation timed out while polling'
                client.post_github_comment(
                    comment_repo, int(comment_issue), comment, github_token
                )
            except Exception:
                pass  # Don't fail on comment posting
        sys.exit(1)

    except Exception as e:
        print(f'❌ Error starting conversation: {e}')
        # Post error comment to GitHub issue (only if explicitly requested)
        if github_token and client and comment_repo and comment_issue is not None:
            try:
                comment = 'Got an error while starting conversation'
                client.post_github_comment(
                    comment_repo, int(comment_issue), comment, github_token
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
        help='Start a new conversation with customizable prompts',
    )
    convo_parser.add_argument(
        '--repository', help="Git repository name in format 'owner/repo'"
    )
    convo_parser.add_argument('--branch', help='Git branch to use')
    convo_parser.add_argument(
        '--prompt-file', help='Prompt template file to use (e.g., new_conversation.j2)'
    )
    convo_parser.add_argument(
        '--custom-prompt', help='Custom prompt text (overrides --prompt-file)'
    )
    convo_parser.add_argument(
        '--api-key', help='OpenHands API key (defaults to OPENHANDS_API_KEY env var)'
    )
    convo_parser.add_argument(
        '--poll', action='store_true', help='Poll until conversation stops'
    )
    convo_parser.add_argument(
        '--comment-repo',
        help="Repository to comment on in format 'owner/repo' (optional)",
    )
    convo_parser.add_argument(
        '--comment-issue',
        type=int,
        help='Issue/PR number to comment on (optional)',
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
    combined_parser.add_argument(
        '--prompt-file',
        help='Prompt template file to use (e.g., new_conversation.j2)',
    )
    combined_parser.add_argument(
        '--custom-prompt',
        help='Custom prompt text (overrides --prompt-file)',
    )
    combined_parser.add_argument(
        '--comment-repo',
        help="Repository to comment on in format 'owner/repo' (optional)",
    )
    combined_parser.add_argument(
        '--comment-issue',
        type=int,
        help='Issue/PR number to comment on (optional)',
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
            prompt_file=args.prompt_file,
            custom_prompt=args.custom_prompt,
            comment_repo=getattr(args, 'comment_repo', None),
            comment_issue=getattr(args, 'comment_issue', None),
        )

    elif args.command == 'configure-and-start':
        configure_llm_settings(api_key=args.api_key)
        start_new_conversation(
            repository=args.repository,
            selected_branch=args.branch,
            api_key=args.api_key,
            poll=args.poll,
            prompt_file=getattr(args, 'prompt_file', None),
            custom_prompt=getattr(args, 'custom_prompt', None),
            comment_repo=getattr(args, 'comment_repo', None),
            comment_issue=getattr(args, 'comment_issue', None),
        )


if __name__ == '__main__':
    main()
