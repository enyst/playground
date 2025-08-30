"""
OpenHands Cloud API client.

Clean, minimal Python wrapper around OpenHands Cloud endpoints.
Handles authentication and provides structured error reporting.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

import requests

DEFAULT_BASE_URL = 'https://app.all-hands.dev'


class CloudAPIError(Exception):
    """Exception raised for Cloud API errors."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response_text: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.response_text = response_text


@dataclass
class OpenHandsCloudClient:
    """OpenHands Cloud API client with clean error handling."""

    api_key: str
    base_url: str = DEFAULT_BASE_URL
    timeout: int = 60
    session: requests.Session | None = None

    def __post_init__(self) -> None:
        # Initialize a persistent session for connection reuse and centralized headers
        if self.session is None:
            self.session = requests.Session()
        # Ensure required headers; Authorization must reflect this client's api_key
        self.session.headers['Authorization'] = f'Bearer {self.api_key}'
        self.session.headers.setdefault('Content-Type', 'application/json')
        self.session.headers.setdefault('Accept', 'application/json')

    def _handle_response(self, response: requests.Response) -> dict[str, Any]:
        """Handle API response with structured error reporting."""
        try:
            response.raise_for_status()
        except requests.HTTPError as e:
            error_msg = f'HTTP {response.status_code}: {e}'
            try:
                error_data = response.json()
                if isinstance(error_data, dict) and 'detail' in error_data:
                    error_msg += f' - {error_data["detail"]}'
            except (ValueError, json.JSONDecodeError):
                # If we can't parse JSON, include raw response text
                error_msg += f' - {response.text[:500]}'

            raise CloudAPIError(
                error_msg, status_code=response.status_code, response_text=response.text
            ) from e
        except requests.RequestException as e:
            raise CloudAPIError(f'Request failed: {e}') from e

        # Success path
        if not response.content:
            return {}
        content_type = response.headers.get('Content-Type', '')
        if 'application/json' in content_type:
            try:
                return response.json()
            except (ValueError, json.JSONDecodeError) as e:
                raise CloudAPIError(
                    'Invalid JSON in response.',
                    status_code=response.status_code,
                    response_text=response.text,
                ) from e

        raise CloudAPIError(
            f"Expected JSON response, got Content-Type: {content_type!r}",
            status_code=response.status_code,
            response_text=response.text,
        )

    def test_auth(self) -> dict[str, Any]:
        """Test authentication by calling server_info endpoint."""
        url = f'{self.base_url}/api/server_info'
        assert self.session is not None
        response = self.session.get(url, timeout=self.timeout)
        return self._handle_response(response)

    def create_conversation(
        self,
        *,
        initial_user_msg: str,
        repository: str | None = None,
        selected_branch: str | None = None,
        conversation_instructions: str | None = None,
        git_provider: str | None = None,
        image_urls: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create a new conversation."""
        url = f'{self.base_url}/api/conversations'
        body: dict[str, Any] = {'initial_user_msg': initial_user_msg}

        optional_params = {
            'repository': repository,
            'git_provider': git_provider,
            'selected_branch': selected_branch,
            'conversation_instructions': conversation_instructions,
            'image_urls': image_urls,
        }
        body.update({k: v for k, v in optional_params.items() if v is not None})

        assert self.session is not None
        response = self.session.post(url, json=body, timeout=self.timeout)
        return self._handle_response(response)

    def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        """Get conversation details."""
        url = f'{self.base_url}/api/conversations/{conversation_id}'
        assert self.session is not None
        response = self.session.get(url, timeout=self.timeout)
        return self._handle_response(response)

    def get_conversation_events(
        self, conversation_id: str, start_id: int = 0, limit: int = 1000
    ) -> dict[str, Any]:
        """Get conversation events."""
        url = f'{self.base_url}/api/conversations/{conversation_id}/events'
        params = {'start_id': start_id, 'limit': limit}
        assert self.session is not None
        response = self.session.get(url, params=params, timeout=self.timeout)
        return self._handle_response(response)

    def get_trajectory(self, conversation_id: str) -> dict[str, Any]:
        """Get conversation trajectory (full event history)."""
        url = f'{self.base_url}/api/conversations/{conversation_id}/trajectory'
        assert self.session is not None
        response = self.session.get(url, timeout=self.timeout)
        return self._handle_response(response)

    def poll_until_complete(
        self,
        conversation_id: str,
        *,
        timeout_s: int = 1800,  # 30 minutes
        poll_interval_s: int = 300,  # 5 minutes
        terminal_statuses: tuple[str, ...] = (
            'STOPPED',  # Conversation finished (success or failure)
        ),
        progress_callback: callable | None = None,
    ) -> str:
        """
        Poll conversation until a terminal status is reached or timeout.

        Args:
            conversation_id: The conversation ID to poll
            timeout_s: Maximum time to wait in seconds
            poll_interval_s: Time between polls in seconds
            terminal_statuses: Status values that indicate completion
            progress_callback: Optional callback function called with (status, elapsed_time)

        Returns:
            Final status string

        Raises:
            CloudAPIError: If polling fails or times out
        """
        deadline = time.time() + timeout_s
        start_time = time.time()
        last_status = ''

        while time.time() < deadline:
            try:
                info = self.get_conversation(conversation_id)
                # Status comes from ConversationStatus enum in the API response
                status = str(info.get('status', '')).upper()

                if status:
                    last_status = status

                elapsed = time.time() - start_time
                if progress_callback:
                    progress_callback(status, elapsed)

                if status in terminal_statuses:
                    return status

            except CloudAPIError as e:
                # Log the error but continue polling unless it's a permanent failure
                if e.status_code and e.status_code < 500:
                    # Client error - likely permanent, stop polling
                    raise
                # Server error - continue polling
                if progress_callback:
                    progress_callback(f'ERROR: {e}', time.time() - start_time)

            time.sleep(poll_interval_s)

        # Timeout reached
        elapsed = time.time() - start_time
        raise CloudAPIError(
            f'Polling timeout after {elapsed:.1f}s. Last status: {last_status}'
        )
