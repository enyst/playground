"""OpenHands Cloud API client for automation tasks."""

import os
import time
from pathlib import Path
from typing import Any, Optional

import requests


class OpenHandsCloudAPI:
    """Client for interacting with OpenHands Cloud API."""

    def __init__(
        self, api_key: Optional[str] = None, base_url: str = 'https://app.all-hands.dev'
    ):
        """Initialize the API client.

        Args:
            api_key: OpenHands API key. If not provided, will use OPENHANDS_API_KEY env var.
            base_url: Base URL for the OpenHands Cloud API.
        """
        self.api_key = api_key or os.getenv('OPENHANDS_API_KEY')
        if not self.api_key:
            raise ValueError(
                'API key is required. Set OPENHANDS_API_KEY environment variable or pass api_key parameter.'
            )

        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update(
            {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json',
            }
        )

    def list_conversations(self, limit: int = 100) -> list[dict[str, Any]]:
        """List conversations with pagination.

        Args:
            limit: Page size (max 100)

        Returns:
            Flattened list of conversation summaries
        """
        results: list[dict[str, Any]] = []
        page_id: str | None = None
        while True:
            params: dict[str, Any] = {'limit': limit}
            if page_id:
                params['page_id'] = page_id
            r = self.session.get(f'{self.base_url}/api/conversations', params=params)
            r.raise_for_status()
            data = r.json()
            results.extend(data.get('results', []))
            page_id = data.get('next_page_id')
            if not page_id:
                break
        return results

    def get_last_event_id(self, conversation_id: str) -> int | None:
        """Return the latest event id using a minimal query."""
        payload = self.get_events(conversation_id, reverse=True, limit=1)
        events = payload.get('events', [])
        return events[0]['id'] if events else None

    def get_recent_model(self, conversation_id: str) -> str | None:
        """Inspect a small recent window for model metadata and return first found."""
        payload = self.get_events(conversation_id, reverse=True, limit=20)
        for e in payload.get('events', []):
            # tool_call_metadata.model_response.model is most reliable
            m = ((e.get('tool_call_metadata') or {}).get('model_response') or {}).get(
                'model'
            )
            if isinstance(m, str):
                return m
            # fallback to common fields
            for k in ('model', 'llm_model', 'provider_model', 'selected_model'):
                v = e.get(k)
                if isinstance(v, str):
                    return v
            meta = e.get('metadata') or e.get('meta') or {}
            for k in ('model', 'llm_model', 'provider_model'):
                v = meta.get(k)
                if isinstance(v, str):
                    return v
            args = e.get('args') or {}
            for k in ('model', 'llm_model'):
                v = args.get(k)
                if isinstance(v, str):
                    return v
        return None

    def get_first_user_message(self, conversation_id: str) -> str | None:
        """Fetch earliest handful of events and return the first user message text if present."""
        payload = self.get_events(conversation_id, start_id=0, limit=20)
        for e in payload.get('events', []):
            if e.get('source') == 'user':
                # Try 'message' then 'content'
                msg = e.get('message') or e.get('content')
                if isinstance(msg, str) and msg.strip():
                    return msg.strip()
        return None

    def get_early_model(self, conversation_id: str) -> str | None:
        """Inspect the earliest small window for the first model reference."""
        payload = self.get_events(conversation_id, start_id=0, limit=20)
        for e in payload.get('events', []):
            m = ((e.get('tool_call_metadata') or {}).get('model_response') or {}).get(
                'model'
            )
            if isinstance(m, str):
                return m
            for k in ('model', 'llm_model', 'provider_model', 'selected_model'):
                v = e.get(k)
                if isinstance(v, str):
                    return v
            meta = e.get('metadata') or e.get('meta') or {}
            for k in ('model', 'llm_model', 'provider_model'):
                v = meta.get(k)
                if isinstance(v, str):
                    return v
            args = e.get('args') or {}
            for k in ('model', 'llm_model'):
                v = args.get(k)
                if isinstance(v, str):
                    return v
        return None

    def store_llm_settings(
        self,
        llm_model: str,
        llm_base_url: Optional[str] = None,
        llm_api_key: Optional[str] = None,
    ) -> dict[str, Any]:
        """Store LLM settings for the Cloud account.

        Args:
            llm_model: The LLM model to use (e.g., "gpt-4", "claude-3-sonnet")
            llm_base_url: Base URL for the LLM API (optional)
            llm_api_key: API key for the LLM provider (optional)

        Returns:
            Response from the settings API
        """
        settings_data = {'llm_model': llm_model}

        if llm_base_url:
            settings_data['llm_base_url'] = llm_base_url
        if llm_api_key:
            settings_data['llm_api_key'] = llm_api_key

        response = self.session.post(
            f'{self.base_url}/api/settings', json=settings_data
        )
        response.raise_for_status()
        return response.json()

    def create_conversation(
        self,
        initial_user_msg: str,
        repository: Optional[str] = None,
        selected_branch: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new conversation.

        Args:
            initial_user_msg: The initial message to start the conversation
            repository: Git repository name in format "owner/repo" (optional)
            selected_branch: Git branch to use (optional)

        Returns:
            Response containing conversation_id and status
        """
        conversation_data = {'initial_user_msg': initial_user_msg}

        if repository:
            conversation_data['repository'] = repository
        if selected_branch:
            conversation_data['selected_branch'] = selected_branch

        response = self.session.post(
            f'{self.base_url}/api/conversations', json=conversation_data
        )
        response.raise_for_status()
        return response.json()

    def create_conversation_from_files(
        self,
        main_prompt_path: str,
        repository: Optional[str] = None,
        append_common_tail: bool = True,
        common_tail_path: str = 'scripts/prompts/common_tail.j2',
    ) -> dict[str, Any]:
        """Create a conversation by reading a prompt file and optional common tail.

        Args:
            main_prompt_path: Path to the main prompt file
            repository: Optional repo in format "owner/repo"
            append_common_tail: If True, append the common tail file contents
            common_tail_path: Path to the common tail file
        """
        main_text = Path(main_prompt_path).read_text()
        if append_common_tail and Path(common_tail_path).exists():
            tail = Path(common_tail_path).read_text()
            initial_user_msg = f'{main_text}\n\n{tail}'
        else:
            initial_user_msg = main_text
        return self.create_conversation(
            initial_user_msg=initial_user_msg,
            repository=repository,
        )

    def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        """Get conversation status and details.

        Args:
            conversation_id: The conversation ID

        Returns:
            Conversation details including status
        """
        response = self.session.get(
            f'{self.base_url}/api/conversations/{conversation_id}'
        )
        response.raise_for_status()
        return response.json()

    def get_trajectory(self, conversation_id: str) -> dict[str, Any]:
        """Get the trajectory (event history) for a conversation.

        Args:
            conversation_id: The conversation ID

        Returns:
            Trajectory data with events
        """
        response = self.session.get(
            f'{self.base_url}/api/conversations/{conversation_id}/trajectory'
        )
        response.raise_for_status()
        return response.json()

    def get_events(
        self,
        conversation_id: str,
        start_id: int = 0,
        end_id: Optional[int] = None,
        reverse: bool = False,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get events from a conversation with filtering and pagination.

        Args:
            conversation_id: The conversation ID
            start_id: Starting ID in the event stream (default: 0)
            end_id: Ending ID in the event stream (optional)
            reverse: Whether to retrieve events in reverse order (default: False)
            limit: Maximum number of events to return, 1-100 (default: 20)

        Returns:
            Events data with pagination info

        Examples:
            # Get latest 50 events in reverse order
            api.get_events(conv_id, reverse=True, limit=50)

            # Get events in a specific range (e.g., events 800-900)
            api.get_events(conv_id, start_id=800, end_id=900, limit=100)

            # Find condensation events in recent history
            events = api.get_events(conv_id, start_id=800, end_id=900, limit=100)
            condensations = [e for e in events['events']
                           if e.get('source') == 'agent' and
                              e.get('action') == 'condensation']
        """
        # Clamp limit to [1, 100]
        limit = max(1, min(100, int(limit)))
        params = {
            'start_id': start_id,
            'reverse': str(reverse).lower(),
            'limit': limit,
        }
        if end_id is not None:
            params['end_id'] = end_id

        response = self.session.get(
            f'{self.base_url}/api/conversations/{conversation_id}/events',
            params=params,
        )
        response.raise_for_status()
        return response.json()

    def poll_until_stopped(
        self, conversation_id: str, timeout: int = 1200, poll_interval: int = 300
    ) -> dict[str, Any]:
        """Poll conversation until it stops or times out.

        Args:
            conversation_id: The conversation ID
            timeout: Maximum time to wait in seconds (default: 20 minutes)
            poll_interval: Time between polls in seconds (default: 5 minutes)

        Returns:
            Final conversation status
        """
        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                conversation = self.get_conversation(conversation_id)
                status = conversation.get('status', '').upper()

                if status == 'STOPPED':
                    return conversation

                # Also stop if conversation is in an error state
                if status in ['FAILED', 'ERROR', 'CANCELLED']:
                    print(f'⚠️  Conversation ended with status: {status}')
                    return conversation

                print(
                    f'Conversation {conversation_id} status: {status}. Waiting {poll_interval}s...'
                )
                time.sleep(poll_interval)

            except Exception as e:
                print(f'Error polling conversation {conversation_id}: {e}')
                print('Stopping polling due to error.')
                raise

        raise TimeoutError(
            f'Conversation {conversation_id} did not stop within {timeout} seconds'
        )

    def post_github_comment(
        self, repo: str, issue_number: int, comment: str, token: str
    ) -> None:
        """Post a comment to a GitHub issue.

        Args:
            repo: Repository in format owner/repo
            issue_number: Issue number
            comment: Comment text
            token: GitHub token
        """
        url = f'https://api.github.com/repos/{repo}/issues/{issue_number}/comments'
        headers = {
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github.v3+json',
        }
        data = {'body': comment}

        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        print(f'✅ Posted comment to GitHub issue #{issue_number}')
