"""
Small CLI to configure Cloud LLM settings via /api/settings.

Intentionally keeps settings separate from the weekly workflow. Do NOT pass provider LLM API keys here unless you explicitly want to, and only via provider_tokens.

Usage examples:
  python scripts/configure_cloud_llm_settings.py \
      --api-key $OPENHANDS_API_KEY \
      --llm-model "$LLM_MODEL" \
      --llm-base-url "$LLM_BASE_URL"

  # With provider tokens if desired (off by default):
  python scripts/configure_cloud_llm_settings.py \
      --api-key $OPENHANDS_API_KEY \
      --provider-token openai=$OPENAI_API_KEY \
      --provider-token groq=$GROQ_API_KEY
"""
from __future__ import annotations

import argparse
import json
from typing import Dict

from scripts.cloud_api import OpenHandsCloudClient


def parse_provider_tokens(items: list[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Invalid --provider-token '{item}', expected key=value")
        k, v = item.split("=", 1)
        out[k.strip()] = v
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--api-key", required=True, help="OpenHands Cloud API key")
    p.add_argument("--base-url", default="https://app.all-hands.dev")
    p.add_argument("--llm-model")
    p.add_argument("--llm-base-url")
    p.add_argument("--confirmation-mode", type=lambda x: x.lower() in ("1","true","yes"))
    p.add_argument("--agent")
    p.add_argument("--security-analyzer")
    p.add_argument("--language")
    p.add_argument("--remote-runtime-resource-factor", type=int)
    p.add_argument("--enable-default-condenser", type=lambda x: x.lower() in ("1","true","yes"))
    p.add_argument("--enable-sound-notifications", type=lambda x: x.lower() in ("1","true","yes"))
    p.add_argument("--user-consents-to-analytics", type=lambda x: x.lower() in ("1","true","yes"))
    p.add_argument("--provider-token", action="append", default=[], help="Repeatable: provider=value (e.g., openai=$KEY)")
    args = p.parse_args()

    client = OpenHandsCloudClient(api_key=args.api_key, base_url=args.base_url)

    provider_tokens = parse_provider_tokens(args.provider_token) if args.provider_token else None

    resp = client.store_llm_settings(
        llm_model=args.llm_model,
        llm_base_url=args.llm_base_url,
        provider_tokens=provider_tokens,
        confirmation_mode=args.confirmation_mode,
        agent=args.agent,
        security_analyzer=args.security_analyzer,
        language=args.language,
        remote_runtime_resource_factor=args.remote_runtime_resource_factor,
        enable_default_condenser=args.enable_default_condenser,
        enable_sound_notifications=args.enable_sound_notifications,
        user_consents_to_analytics=args.user_consents_to_analytics,
    )
    print(json.dumps(resp, indent=2))


if __name__ == "__main__":
    main()
