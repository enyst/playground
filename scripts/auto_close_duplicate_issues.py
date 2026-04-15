#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

GITHUB_API_BASE_URL = 'https://api.github.com'
DUPLICATE_MARKER_RE = re.compile(
    r'<!-- openhands-duplicate-check canonical=(?P<canonical>\d+) auto-close=(?P<auto_close>true|false) -->'
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Auto-close issues previously flagged as duplicate candidates.'
    )
    parser.add_argument('--repository', required=True)
    parser.add_argument('--close-after-days', type=int, default=3)
    parser.add_argument('--dry-run', action='store_true')
    return parser.parse_args()


def github_headers() -> dict[str, str]:
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        raise RuntimeError('GITHUB_TOKEN environment variable is required')
    return {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'openhands-duplicate-auto-close',
        'X-GitHub-Api-Version': '2022-11-28',
    }


def request_json(
    path: str,
    *,
    method: str = 'GET',
    body: dict[str, Any] | None = None,
) -> Any:
    request_body = None
    headers = github_headers()
    if body is not None:
        request_body = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    request = urllib.request.Request(
        f'{GITHUB_API_BASE_URL}{path}',
        data=request_body,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode('utf-8')
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(
            f'{method} {path} failed with HTTP {exc.code}: {error_body}'
        ) from exc

    if not payload:
        return None
    return json.loads(payload)


def parse_timestamp(value: str) -> datetime:
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def list_open_issues(repository: str) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    page = 1
    while True:
        payload = request_json(
            f'/repos/{repository}/issues?state=open&per_page=100&page={page}'
        )
        if not isinstance(payload, list) or not payload:
            return issues
        for issue in payload:
            if issue.get('pull_request'):
                continue
            issues.append(issue)
        page += 1


def list_issue_comments(repository: str, issue_number: int) -> list[dict[str, Any]]:
    comments: list[dict[str, Any]] = []
    page = 1
    while True:
        payload = request_json(
            f'/repos/{repository}/issues/{issue_number}/comments?per_page=100&page={page}'
        )
        if not isinstance(payload, list) or not payload:
            return comments
        comments.extend(payload)
        page += 1


def list_comment_reactions(repository: str, comment_id: int) -> list[dict[str, Any]]:
    reactions: list[dict[str, Any]] = []
    page = 1
    while True:
        payload = request_json(
            f'/repos/{repository}/issues/comments/{comment_id}/reactions?per_page=100&page={page}'
        )
        if not isinstance(payload, list) or not payload:
            return reactions
        reactions.extend(payload)
        page += 1


def extract_duplicate_metadata(comment_body: str) -> tuple[int | None, bool]:
    match = DUPLICATE_MARKER_RE.search(comment_body)
    if not match:
        return None, False
    return int(match.group('canonical')), match.group('auto_close') == 'true'


def find_latest_auto_close_comment(
    comments: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, int | None]:
    latest_comment: dict[str, Any] | None = None
    latest_canonical_issue: int | None = None
    for comment in comments:
        canonical_issue, auto_close = extract_duplicate_metadata(
            comment.get('body') or ''
        )
        if canonical_issue is None or not auto_close:
            continue
        latest_comment = comment
        latest_canonical_issue = canonical_issue
    return latest_comment, latest_canonical_issue


def close_issue_as_duplicate(
    repository: str,
    issue_number: int,
    canonical_issue_number: int,
    *,
    dry_run: bool,
) -> None:
    if dry_run:
        return

    request_json(
        f'/repos/{repository}/issues/{issue_number}',
        method='PATCH',
        body={'state': 'closed', 'state_reason': 'duplicate'},
    )
    request_json(
        f'/repos/{repository}/issues/{issue_number}/comments',
        method='POST',
        body={
            'body': (
                f'This issue has been automatically closed as a duplicate of #{canonical_issue_number}.\n\n'
                'If this is incorrect, please add a comment and it can be reopened.\n\n'
                '_This comment was created by an AI assistant (OpenHands) on behalf of the repository maintainer._'
            )
        },
    )


def main() -> int:
    args = parse_args()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=args.close_after_days)

    summary: list[dict[str, Any]] = []
    for issue in list_open_issues(args.repository):
        issue_number = int(issue['number'])
        issue_created_at = parse_timestamp(issue['created_at'])
        if issue_created_at > cutoff:
            continue

        comments = list_issue_comments(args.repository, issue_number)
        latest_comment, canonical_issue_number = find_latest_auto_close_comment(
            comments
        )
        if latest_comment is None or canonical_issue_number is None:
            continue

        comment_created_at = parse_timestamp(latest_comment['created_at'])
        if comment_created_at > cutoff:
            continue

        newer_comments = [
            comment
            for comment in comments
            if parse_timestamp(comment['created_at']) > comment_created_at
        ]
        if newer_comments:
            summary.append(
                {
                    'issue_number': issue_number,
                    'action': 'kept-open',
                    'reason': 'newer-comment-after-duplicate-notice',
                }
            )
            continue

        author_id = issue.get('user', {}).get('id')
        reactions = list_comment_reactions(args.repository, int(latest_comment['id']))
        author_thumbs_down = any(
            reaction.get('user', {}).get('id') == author_id
            and reaction.get('content') == '-1'
            for reaction in reactions
        )
        author_thumbs_up = any(
            reaction.get('user', {}).get('id') == author_id
            and reaction.get('content') == '+1'
            for reaction in reactions
        )
        if author_thumbs_down:
            summary.append(
                {
                    'issue_number': issue_number,
                    'action': 'kept-open',
                    'reason': 'author-thumbed-down-duplicate-comment',
                    'author_thumbs_up': author_thumbs_up,
                }
            )
            continue

        close_issue_as_duplicate(
            args.repository,
            issue_number,
            canonical_issue_number,
            dry_run=args.dry_run,
        )
        summary.append(
            {
                'issue_number': issue_number,
                'action': 'closed-as-duplicate'
                if not args.dry_run
                else 'would-close-as-duplicate',
                'canonical_issue_number': canonical_issue_number,
                'author_thumbs_up': author_thumbs_up,
            }
        )

    print(json.dumps({'repository': args.repository, 'results': summary}, indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f'error: {exc}', file=sys.stderr)
        raise
