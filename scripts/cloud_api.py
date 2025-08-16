"""
OpenHands Cloud API client.

Provides a thin Python wrapper around the documented Cloud endpoints:
- POST /api/settings
- POST /api/conversations
- GET  /api/conversations/{conversation_id}
- GET  /api/conversations/{conversation_id}/trajectory

Notes:
- We intentionally do NOT send any LLM API keys here. Authentication is handled via the
  OpenHands Cloud API key (Bearer token). LLM provider tokens, if required, should be
  pre-configured on the Cloud account, or provided separately via provider_tokens.

This module only defines methods. The workflow may choose which ones to call.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional
import time

import requests


DEFAULT_BASE_URL = "https://app.all-hands.dev"


@dataclass
class OpenHandsCloudClient:
    api_key: str
    base_url: str = DEFAULT_BASE_URL

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    # --- Settings ---
    def store_llm_settings(
        self,
        *,
        llm_model: Optional[str] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: Optional[str] = None,
        provider_tokens: Optional[Dict[str, str]] = None,
        confirmation_mode: Optional[bool] = None,
        agent: Optional[str] = None,
        security_analyzer: Optional[str] = None,
        language: Optional[str] = None,
        remote_runtime_resource_factor: Optional[int] = None,
        enable_default_condenser: Optional[bool] = None,
        enable_sound_notifications: Optional[bool] = None,
        user_consents_to_analytics: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Store user settings for the Cloud account.

        Notes:
        - LLM credentials: pass llm_api_key (and optionally llm_model/llm_base_url).
        - Provider tokens: provider_tokens is for Git providers or other integrations
          (e.g., GitHub/GitLab/Bitbucket/Jira), not LLM provider API keys.

        Only fields that are not None are included in the request body.
        """
        url = f"{self.base_url}/api/settings"
        body: Dict[str, Any] = {}

        if language is not None:
            body["language"] = language
        if agent is not None:
            body["agent"] = agent
        if security_analyzer is not None:
            body["security_analyzer"] = security_analyzer
        if confirmation_mode is not None:
            body["confirmation_mode"] = confirmation_mode
        if llm_model is not None:
            body["llm_model"] = llm_model
        if llm_api_key is not None:
            body["llm_api_key"] = llm_api_key
        if llm_base_url is not None:
            body["llm_base_url"] = llm_base_url
        if remote_runtime_resource_factor is not None:
            body["remote_runtime_resource_factor"] = remote_runtime_resource_factor
        if enable_default_condenser is not None:
            body["enable_default_condenser"] = enable_default_condenser
        if enable_sound_notifications is not None:
            body["enable_sound_notifications"] = enable_sound_notifications
        if user_consents_to_analytics is not None:
            body["user_consents_to_analytics"] = user_consents_to_analytics
        if provider_tokens is not None:
            # Use the provider_tokens field as per API docs if needed.
            body["provider_tokens"] = provider_tokens

        resp = requests.post(url, headers=self._headers(), json=body, timeout=60)
        resp.raise_for_status()
        return resp.json() if resp.content else {}

    # --- Conversations ---
    def create_conversation(
        self,
        *,
        initial_user_msg: str,
        repository: Optional[str] = None,
        selected_branch: Optional[str] = None,
        conversation_instructions: Optional[str] = None,
        git_provider: Optional[str] = None,
        image_urls: Optional[list[str]] = None,
        replay_json: Optional[str] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/api/conversations"
        body: Dict[str, Any] = {"initial_user_msg": initial_user_msg}
        if repository:
            body["repository"] = repository
        if git_provider:
            body["git_provider"] = git_provider
        if selected_branch:
            body["selected_branch"] = selected_branch
        if conversation_instructions:
            body["conversation_instructions"] = conversation_instructions
        if image_urls:
            body["image_urls"] = image_urls
        if replay_json:
            body["replay_json"] = replay_json

        resp = requests.post(url, headers=self._headers(), json=body, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def get_conversation(self, conversation_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/api/conversations/{conversation_id}"
        resp = requests.get(url, headers=self._headers(), timeout=60)
        resp.raise_for_status()
        return resp.json()

    def get_trajectory(self, conversation_id: str) -> Dict[str, Any]:
        url = f"{self.base_url}/api/conversations/{conversation_id}/trajectory"
        resp = requests.get(url, headers=self._headers(), timeout=60)
        resp.raise_for_status()
        return resp.json()

    def poll_until_complete(
        self,
        conversation_id: str,
        *,
        timeout_s: int = 1800,
        poll_interval_s: int = 10,
        terminal_statuses: tuple[str, ...] = ("COMPLETED", "FAILED", "STOPPED", "PAUSED"),
    ) -> str:
        """Poll conversation until a terminal status is reached or timeout.
        Returns the final status string.
        """
        deadline = time.time() + timeout_s
        last_status = ""
        while time.time() < deadline:
            info = self.get_conversation(conversation_id)
            status = str(info.get("status") or info.get("Status") or "").upper()
            if status:
                last_status = status
            if status in terminal_statuses:
                return status
            time.sleep(poll_interval_s)
        return last_status or "UNKNOWN"
