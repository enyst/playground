"""OpenHands Cloud API client for automation tasks."""

import os
import time
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

    def poll_until_complete(
        self, conversation_id: str, timeout: int = 1200, poll_interval: int = 300
    ) -> dict[str, Any]:
        """Poll conversation until it completes or times out.

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

                if status in ['COMPLETED', 'FAILED', 'STOPPED']:
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
            f'Conversation {conversation_id} did not complete within {timeout} seconds'
        )
