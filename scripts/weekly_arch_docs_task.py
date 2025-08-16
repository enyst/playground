"""
Entrypoint script to invoke the OpenHands Cloud API for the weekly architecture docs audit.

This script demonstrates calling our thin client but keeps each operation isolated.
We intentionally DO NOT call store_llm_settings here; callers (e.g., a one-time admin script)
may use it separately if they need to change Cloud account LLM settings.

Usage:
  python scripts/weekly_arch_docs_task.py --repo <owner/repo> [--branch main]
"""
from __future__ import annotations

import argparse
import json
import textwrap
from typing import Optional

import os
import sys
# Ensure repo root and scripts/ are importable whether invoked as a module or script
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)
try:
    from scripts.cloud_api import OpenHandsCloudClient
except ModuleNotFoundError:
    from cloud_api import OpenHandsCloudClient


def start_weekly_conversation(client: OpenHandsCloudClient, repo: str, branch: str = "main") -> dict:
    initial_user_msg = textwrap.dedent(
        """
        You are an AI software engineer working in this repository. Task:
        1) Review docs/usage/architecture/backend.mdx and docs/usage/architecture/runtime.mdx.
        2) Compare to the current codebase (esp. openhands/ and runtime code).
        3) If material changes occurred since last week:
           - Update the docs accurately; keep edits minimal and factual with references.
           - If diagrams are out of date and simple to refresh, update or add a precise TODO.
           - Open a PR following .github/pull_request_template.md with a clear technical report.
        4) If nothing meaningful changed, do NOT open a PR; summarize findings in the conversation.
        """
    )

    conversation_instructions = textwrap.dedent(
        """
        Rules:
        - Only modify architecture docs unless necessary.
        - Make smallest correct changes; keep style consistent.
        - If opening a PR, follow the PR template and include a technical report.
        - If no meaningful change, summarize findings only (no PR).
        """
    )

    return client.create_conversation(
        initial_user_msg=initial_user_msg,
        repository=repo,
        selected_branch=branch,
        conversation_instructions=conversation_instructions,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", required=True, help="OpenHands Cloud API key")
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument("--branch", default="main", help="Selected branch")
    parser.add_argument("--base-url", default="https://app.all-hands.dev", help="Override Cloud base URL")
    parser.add_argument("--poll", action="store_true", help="Poll until complete")
    args = parser.parse_args()

    client = OpenHandsCloudClient(api_key=args.api_key, base_url=args.base_url)
    js = start_weekly_conversation(client, repo=args.repo, branch=args.branch)

    conv_id = js.get("conversation_id") or js.get("id")
    url = f"{client.base_url}/conversations/{conv_id}" if conv_id else "(no id)"

    print(json.dumps(js, indent=2))
    print(f"Conversation: {url}")

    if args.poll and conv_id:
        status = client.poll_until_complete(conv_id, timeout_s=1800, poll_interval_s=15)
        print(f"Final status: {status}")


if __name__ == "__main__":
    main()
