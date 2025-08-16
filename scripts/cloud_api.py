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
        params: Dict[str, Any] = {
            "language": language,
            "agent": agent,
            "security_analyzer": security_analyzer,
            "confirmation_mode": confirmation_mode,
            "llm_model": llm_model,
            "llm_api_key": llm_api_key,
            "llm_base_url": llm_base_url,
            "remote_runtime_resource_factor": remote_runtime_resource_factor,
            "enable_default_condenser": enable_default_condenser,
            "enable_sound_notifications": enable_sound_notifications,
            "user_consents_to_analytics": user_consents_to_analytics,
            "provider_tokens": provider_tokens,
        }
        body: Dict[str, Any] = {k: v for k, v in params.items() if v is not None}

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
        optional_params = {
            "repository": repository,
            "git_provider": git_provider,
            "selected_branch": selected_branch,
            "conversation_instructions": conversation_instructions,
            "image_urls": image_urls,
            "replay_json": replay_json,
        }
        body.update({k: v for k, v in optional_params.items() if v})

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
