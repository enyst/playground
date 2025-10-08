from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from pydantic import SecretStr

from openhands.integrations.provider import PROVIDER_TOKEN_TYPE, ProviderToken
from openhands.integrations.service_types import ProviderType
from openhands.server.user_auth.user_auth import AuthType, UserAuth


class TokenSource:
    """Per-request token accessor that hides refresh mechanics and token provenance.

    Minimal interface to avoid threading primitives through routes/services.
    Implementations should cache results within a request lifecycle.
    """

    async def get_access_token(self) -> SecretStr | None:  # keycloak access token
        raise NotImplementedError

    async def get_provider_tokens(self) -> PROVIDER_TOKEN_TYPE | None:
        raise NotImplementedError

    async def get_provider_token(self, provider: ProviderType) -> ProviderToken | None:
        tokens = await self.get_provider_tokens()
        return tokens.get(provider) if tokens else None

    def get_auth_type(self) -> AuthType | None:
        raise NotImplementedError


@dataclass
class AuthTokenSource(TokenSource):
    """TokenSource backed by UserAuth (enterprise/saas)."""

    user_auth: UserAuth
    _access_token: SecretStr | None = None
    _provider_tokens: PROVIDER_TOKEN_TYPE | None = None

    async def get_access_token(self) -> SecretStr | None:
        if self._access_token is None:
            self._access_token = await self.user_auth.get_access_token()
        return self._access_token

    async def get_provider_tokens(self) -> PROVIDER_TOKEN_TYPE | None:
        if self._provider_tokens is None:
            self._provider_tokens = await self.user_auth.get_provider_tokens()
        return self._provider_tokens

    def get_auth_type(self) -> AuthType | None:
        return self.user_auth.get_auth_type()
