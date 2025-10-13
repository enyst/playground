from dataclasses import dataclass

from fastapi import Request

from openhands.app_server.user.token_source import TokenSource
from openhands.app_server.user.user_context import UserContext, UserContextInjector
from openhands.app_server.user.user_models import Identity, UserInfo
from openhands.integrations.provider import ProviderHandler, ProviderType
from openhands.app_server.errors import OpenHandsError
from openhands.app_server.user.user_context import UserContext
from openhands.app_server.user.user_models import UserInfo
from openhands.integrations.provider import ProviderType
from openhands.sdk.conversation.secret_source import SecretSource


@dataclass(frozen=True)
class AdminUserContext(UserContext):
    """User context for use in admin operations which allows access beyond the scope of a single user"""

    user_id: str | None

    async def get_user_id(self) -> str | None:
        return self.user_id

    async def require_user_id(self) -> str:
        raise NotImplementedError()

    async def get_identity(self) -> Identity:
        raise NotImplementedError()

    async def get_user_email(self) -> str | None:
        raise NotImplementedError()

    async def get_user_info(self) -> UserInfo:
        raise NotImplementedError()

    async def get_authenticated_git_url(self, repository: str) -> str:
        raise NotImplementedError()

    async def get_latest_token(self, provider_type: ProviderType) -> str | None:
        raise NotImplementedError()

    async def get_secrets(self) -> dict[str, SecretSource]:
        raise NotImplementedError()

    async def get_provider_handler(self, strict: bool = True) -> ProviderHandler:
        raise NotImplementedError()

    async def get_token_source(self) -> TokenSource:
        raise NotImplementedError()


USER_CONTEXT_ATTR = 'user_context'
ADMIN = AdminUserContext(user_id=None)


def as_admin(request: Request):
    """Service the request as an admin user without restrictions. The endpoint should
    handle security."""
    user_context = getattr(request.state, USER_CONTEXT_ATTR, None)
    if user_context not in (None, ADMIN):
        raise OpenHandsError(
            'Non admin context already present! '
            '(Do you need to move the as_admin dependency to the start of the args?)'
        )
    setattr(request.state, USER_CONTEXT_ATTR, ADMIN)
    return ADMIN
