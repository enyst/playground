"""
OpenHands Cron Agents - Weekly automated tasks using the OpenHands API.

This module contains the main functions for running weekly automated tasks:
1. Architecture documentation audit
2. OpenAPI drift detection

Each function handles the complete workflow: prompt rendering, conversation creation,
polling, and result extraction with structured error reporting.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import jinja2
import requests
from openhands_api import OpenHandsAPIClient, OpenHandsAPIError

# Configure logging
logging.basicConfig(
    level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def load_prompt_template(template_name: str, **kwargs) -> str:
    """Load and render a Jinja2 prompt template."""
    try:
        script_dir = Path(__file__).parent
        template_path = script_dir / 'prompts' / f'{template_name}.j2'

        if not template_path.exists():
            raise FileNotFoundError(f'Template not found: {template_path}')

        with open(template_path, 'r', encoding='utf-8') as f:
            template_content = f.read()

        template = jinja2.Template(template_content)
        return template.render(**kwargs)

    except Exception as e:
        logger.error(f'Failed to load template {template_name}: {e}')
        raise


def extract_report_from_events(
    trajectory_data: dict[str, Any], report_markers: tuple[str, str]
) -> str | None:
    """Extract delimited report from conversation trajectory."""
    try:
        start_marker, end_marker = report_markers

        # Collect all agent messages and observation content
        messages = []
        for event in trajectory_data.get('trajectory', []):
            # Get message from actions (agent messages)
            if event.get('source') == 'agent' and event.get('message'):
                messages.append(event.get('message', ''))

            # Get content from observations (tool outputs, etc.)
            elif event.get('content'):
                messages.append(event.get('content', ''))

        # Join all messages and look for report
        full_text = '\n'.join(messages)

        # Extract report between markers
        pattern = f'{re.escape(start_marker)}(.*?){re.escape(end_marker)}'
        match = re.search(pattern, full_text, re.DOTALL)

        if match:
            return match.group(1).strip()

        logger.warning('Report markers not found in conversation trajectory')
        return None

    except Exception as e:
        logger.error(f'Failed to extract report from trajectory: {e}')
        return None


def progress_callback(status: str, elapsed_time: float) -> None:
    """Progress callback for polling."""
    logger.info(f'Status: {status} (elapsed: {elapsed_time:.1f}s)')


def run_architecture_audit(
    api_key: str,
    repository: str,
    branch: str = 'main',
    base_url: str = 'https://app.all-hands.dev',
    poll_timeout: int = 1800,
) -> dict[str, Any]:
    """
    Run weekly architecture documentation audit.

    Returns:
        Dict with keys: success, conversation_id, conversation_url, status, report, error
    """
    result = {
        'success': False,
        'conversation_id': None,
        'conversation_url': None,
        'status': None,
        'report': None,
        'error': None,
    }

    try:
        logger.info(f'Starting architecture audit for {repository}:{branch}')

        # Initialize client
        client = OpenHandsAPIClient(api_key=api_key, base_url=base_url)

        # Test authentication
        logger.info('Testing authentication...')
        client.test_auth()
        logger.info('Authentication successful')

        # Load and render prompt
        logger.info('Loading prompt template...')
        prompt = load_prompt_template(
            'architecture_audit', repository=repository, branch=branch
        )

        # Create conversation
        logger.info('Creating conversation...')
        conv_response = client.create_conversation(
            initial_user_msg=prompt,
            repository=repository,
            selected_branch=branch,
            conversation_instructions='Focus on architecture documentation accuracy. Only make changes if material discrepancies are found.',
        )

        conversation_id = conv_response.get('conversation_id') or conv_response.get(
            'id'
        )
        if not conversation_id:
            raise OpenHandsAPIError('No conversation ID returned from API')

        result['conversation_id'] = conversation_id
        result['conversation_url'] = f'{base_url}/conversations/{conversation_id}'

        logger.info(f'Conversation created: {result["conversation_url"]}')

        # Poll for completion
        logger.info('Polling for completion...')
        final_status = client.poll_until_complete(
            conversation_id, timeout_s=poll_timeout, progress_callback=progress_callback
        )

        result['status'] = final_status
        logger.info(f'Conversation completed with status: {final_status}')

        # Get trajectory and extract any findings
        logger.info('Fetching conversation trajectory...')
        trajectory_data = client.get_trajectory(conversation_id)
        trajectory = trajectory_data.get('trajectory', [])

        # For architecture audit, we don't have specific report markers,
        # so we'll just collect the last few assistant messages as summary
        assistant_messages = []
        for event in trajectory:
            if event.get('source') == 'agent' and event.get('message'):
                content = event.get('message', '')
                if content and isinstance(content, str):
                    assistant_messages.append(content)

        if assistant_messages:
            # Take the last few messages as the summary
            result['report'] = '\n\n'.join(assistant_messages[-3:])

        result['success'] = True
        logger.info('Architecture audit completed successfully')

    except Exception as e:
        error_msg = f'Architecture audit failed: {e}'
        logger.error(error_msg)
        result['error'] = error_msg

        # Include more details for OpenHandsAPIError
        if isinstance(e, OpenHandsAPIError):
            if e.status_code:
                result['error'] += f' (HTTP {e.status_code})'
            if e.response_text:
                result['error'] += f'\nResponse: {e.response_text[:500]}'

    return result


def run_openapi_drift_check(
    api_key: str,
    repository: str,
    branch: str = 'main',
    base_url: str = 'https://app.all-hands.dev',
    poll_timeout: int = 1800,
) -> dict[str, Any]:
    """
    Run weekly OpenAPI drift detection.

    Returns:
        Dict with keys: success, conversation_id, conversation_url, status, report,
                       drift_detected, pr_url, pr_number, error
    """
    result = {
        'success': False,
        'conversation_id': None,
        'conversation_url': None,
        'status': None,
        'report': None,
        'drift_detected': False,
        'pr_url': None,
        'pr_number': None,
        'error': None,
    }

    try:
        logger.info(f'Starting OpenAPI drift check for {repository}:{branch}')

        # Initialize client
        client = OpenHandsAPIClient(api_key=api_key, base_url=base_url)

        # Test authentication
        logger.info('Testing authentication...')
        client.test_auth()
        logger.info('Authentication successful')

        # Load and render prompt
        logger.info('Loading prompt template...')
        date_suffix = datetime.now().strftime('%Y%m%d')
        prompt = load_prompt_template(
            'openapi_drift',
            repository=repository,
            branch=branch,
            date_suffix=date_suffix,
            drift_detected=False,  # Template placeholder
            pr_url='',  # Template placeholder
            pr_number='',  # Template placeholder
        )

        # Create conversation
        logger.info('Creating conversation...')
        conv_response = client.create_conversation(
            initial_user_msg=prompt,
            repository=repository,
            selected_branch=branch,
            conversation_instructions='Focus on OpenAPI drift detection. Only create PRs for consumer-impacting changes.',
        )

        conversation_id = conv_response.get('conversation_id') or conv_response.get(
            'id'
        )
        if not conversation_id:
            raise OpenHandsAPIError('No conversation ID returned from API')

        result['conversation_id'] = conversation_id
        result['conversation_url'] = f'{base_url}/conversations/{conversation_id}'

        logger.info(f'Conversation created: {result["conversation_url"]}')

        # Poll for completion
        logger.info('Polling for completion...')
        final_status = client.poll_until_complete(
            conversation_id, timeout_s=poll_timeout, progress_callback=progress_callback
        )

        result['status'] = final_status
        logger.info(f'Conversation completed with status: {final_status}')

        # Get trajectory and extract report
        logger.info('Fetching conversation trajectory...')
        trajectory_data = client.get_trajectory(conversation_id)

        # Extract the delimited report
        report = extract_report_from_events(
            trajectory_data,
            ('=== OPENAPI_DIFF_REPORT_START ===', '=== OPENAPI_DIFF_REPORT_END ==='),
        )

        if report:
            result['report'] = report

            # Parse structured fields from report
            drift_match = re.search(
                r'drift_detected:\s*(true|false)', report, re.IGNORECASE
            )
            if drift_match:
                result['drift_detected'] = drift_match.group(1).lower() == 'true'

            pr_url_match = re.search(r'pr_url:\s*(\S+)', report)
            if pr_url_match and pr_url_match.group(1) not in ('', 'empty'):
                result['pr_url'] = pr_url_match.group(1)

            pr_number_match = re.search(r'pr_number:\s*(\d+)', report)
            if pr_number_match:
                result['pr_number'] = pr_number_match.group(1)
        else:
            logger.warning('No structured report found in conversation')

        result['success'] = True
        logger.info('OpenAPI drift check completed successfully')

    except Exception as e:
        error_msg = f'OpenAPI drift check failed: {e}'
        logger.error(error_msg)
        result['error'] = error_msg

        # Include more details for OpenHandsAPIError
        if isinstance(e, OpenHandsAPIError):
            if e.status_code:
                result['error'] += f' (HTTP {e.status_code})'
            if e.response_text:
                result['error'] += f'\nResponse: {e.response_text[:500]}'

    return result


def main():
    """CLI interface for running cron agents."""
    parser = argparse.ArgumentParser(description='OpenHands Cron Agents')
    parser.add_argument(
        'task', choices=['architecture-audit', 'openapi-drift'], help='Task to run'
    )
    parser.add_argument('--repository', required=True, help='Repository (owner/repo)')
    parser.add_argument('--branch', default='main', help='Branch to work on')
    parser.add_argument(
        '--base-url', default='https://app.all-hands.dev', help='OpenHands API base URL'
    )
    parser.add_argument(
        '--timeout', type=int, default=1800, help='Polling timeout in seconds'
    )
    parser.add_argument('--output', help='Output file for results (JSON)')

    args = parser.parse_args()

    # Read API key exclusively from environment to avoid CLI secrets
    api_key = os.environ.get('OPENHANDS_API_KEY')
    if not api_key:
        logger.error('Missing API key: set OPENHANDS_API_KEY in the environment')
        sys.exit(2)

    # Run the appropriate task
    if args.task == 'architecture-audit':
        result = run_architecture_audit(
            api_key=api_key,
            repository=args.repository,
            branch=args.branch,
            base_url=args.base_url,
            poll_timeout=args.timeout,
        )
    elif args.task == 'openapi-drift':
        result = run_openapi_drift_check(
            api_key=api_key,
            repository=args.repository,
            branch=args.branch,
            base_url=args.base_url,
            poll_timeout=args.timeout,
        )
    else:
        logger.error(f'Unknown task: {args.task}')
        sys.exit(1)
    # Post a human-friendly report as a comment to the tracking issue if configured
    issue_number = os.environ.get('CRON_AGENTS_ISSUE_NUMBER')
    github_repo = os.environ.get('GITHUB_REPOSITORY')
    github_token = os.environ.get('GITHUB_TOKEN')

    if issue_number and github_repo and github_token:
        owner_repo = github_repo
        api_url = (
            f'https://api.github.com/repos/{owner_repo}/issues/{issue_number}/comments'
        )

        def fmt_bool(v: bool | None) -> str:
            return 'yes' if v else 'no'

        # Build a human-friendly body
        if args.task == 'architecture-audit':
            title = f'Architecture Audit — {args.repository}@{args.branch}'
            body_lines = [
                'I am OpenHands, an AI engineer. Posting weekly Architecture Audit results.',
                f'Status: {"success" if result.get("success") else "failed"}',
                f'Conversation: {result.get("conversation_url") or "(n/a)"}',
            ]
            if result.get('status'):
                body_lines.append(f'Final conversation status: {result["status"]}')
            if result.get('error'):
                body_lines.append('Error details:\n' + str(result['error'])[:800])
            if result.get('report'):
                body_lines.append('Summary:\n' + result['report'][:4000])
            body = f'### {title}\n\n' + '\n\n'.join(body_lines)
        else:
            title = f'OpenAPI Drift — {args.repository}@{args.branch}'
            body_lines = [
                'I am OpenHands, an AI engineer. Posting weekly OpenAPI Drift results.',
                f'Status: {"success" if result.get("success") else "failed"}',
                f'Conversation: {result.get("conversation_url") or "(n/a)"}',
            ]
            if result.get('status'):
                body_lines.append(f'Final conversation status: {result["status"]}')
            body_lines.append(
                f'Drift detected: {fmt_bool(result.get("drift_detected"))}'
            )
            if result.get('pr_url'):
                body_lines.append(f'PR: {result["pr_url"]}')
            if result.get('report'):
                body_lines.append('Report:\n' + result['report'][:4000])
            if result.get('error'):
                body_lines.append('Error details:\n' + str(result['error'])[:800])
            body = f'### {title}\n\n' + '\n\n'.join(body_lines)

        headers = {
            'Authorization': f'token {github_token}',
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'openhands-cron-agents',
        }
        try:
            resp = requests.post(
                api_url, headers=headers, json={'body': body}, timeout=30
            )
            if resp.status_code >= 300:
                logger.warning(
                    f'Failed to post GitHub comment: HTTP {resp.status_code} - {resp.text[:300]}'
                )
            else:
                logger.info(f'Posted comment to issue #{issue_number}')
        except Exception as e:
            logger.warning(f'Error posting GitHub comment: {e}')

    # Output results
    print(json.dumps(result, indent=2))

    # Save to file if requested
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(result, f, indent=2)
        logger.info(f'Results saved to {args.output}')

    # Exit with appropriate code
    sys.exit(0 if result['success'] else 1)


if __name__ == '__main__':
    main()
