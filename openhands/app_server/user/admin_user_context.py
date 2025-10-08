from dataclasses import dataclass
from typing import Callable

from fastapi import Request
from pydantic import SecretStr

from openhands.app_server.user.user_context import UserContext, UserContextInjector
from openhands.app_server.user.user_models import UserInfo
from openhands.integrations.provider import ProviderHandler, ProviderType
from openhands.sdk.conversation.secret_source import SecretSource
from openhands.server.user_auth.user_auth import AuthType


@dataclass
class AdminUserContext(UserContext):
    """User context for use in admin operations which allows access beyond the scope of a single user"""

    user_id: str | None

    async def get_user_id(self) -> str | None:
        return self.user_id

    async def get_user_info(self) -> UserInfo:
        raise NotImplementedError()

    async def get_authenticated_git_url(self, repository: str) -> str:
        raise NotImplementedError()

    async def get_latest_token(self, provider_type: ProviderType) -> str | None:
        raise NotImplementedError()

    async def get_secrets(self) -> dict[str, SecretSource]:
        raise NotImplementedError()

    async def get_provider_handler(self) -> ProviderHandler:
        raise NotImplementedError()

    async def get_access_token(self) -> SecretStr | None:
        return None

    async def get_auth_type(self) -> AuthType | None:
        return None


class AdminUserContextInjector(UserContextInjector):
    def get_injector(self) -> Callable:
        return resolve_admin

    async def get_for_user(self, user_id: str | None) -> UserContext:
        return AdminUserContext(user_id)


def resolve_admin(request: Request) -> UserContext:
    """Adding this as a dependency to the start of the endpoint means that the
    services will function in admin mode, with no user filtering."""
    user_context = getattr(request.state, 'user_context', None)
    if user_context is None:
        user_context = AdminUserContext(user_id=None)
        setattr(request.state, 'user_context', user_context)
    return user_context
