from abc import ABC, abstractmethod
from typing import Awaitable, Callable

from openhands.app_server.user.token_source import TokenSource
from openhands.app_server.user.user_models import (
    Identity,
    UserInfo,
)
from openhands.integrations.provider import ProviderHandler, ProviderType
from openhands.sdk.conversation.secret_source import SecretSource
from openhands.sdk.utils.models import DiscriminatedUnionMixin


class UserContext(ABC):
    """Service for managing users.

    Unified per-request identity and auth boundary. Implementations must ensure
    that user and token verification are performed internally so that routes/services
    don't need to repeat auth checks.
    """

    # Read methods

    @abstractmethod
    async def get_user_id(self) -> str | None:
        """Get the user id (may be None for anonymous OSS flows)."""

    @abstractmethod
    async def require_user_id(self) -> str:
        """Get the user id or raise if not authenticated."""

    @abstractmethod
    async def get_identity(self) -> Identity:
        """Basic identity data: id, email, auth_type."""

    @abstractmethod
    async def get_user_info(self) -> UserInfo:
        """Get the user info including persisted settings."""

    @abstractmethod
    async def get_user_email(self) -> str | None:
        """Convenience accessor for the user's email if available."""

    @abstractmethod
    async def get_authenticated_git_url(self, repository: str) -> str:
        """Get an authenticated git URL for the repository"""

    @abstractmethod
    async def get_latest_token(self, provider_type: ProviderType) -> str | None:
        """Get the latest token for the provider type given"""

    @abstractmethod
    async def get_secrets(self) -> dict[str, SecretSource]:
        """Get custom secrets and provider secrets for the conversation."""

    # New unified identity/auth accessors
    @abstractmethod
    async def get_provider_handler(self, strict: bool = True) -> ProviderHandler:
        """Get a provider handler preconfigured for the current user.

        strict=True requires provider tokens; strict=False allows empty tokens (public access)"""

    @abstractmethod
    async def get_token_source(self) -> TokenSource:
        """Get a per-request TokenSource for access + provider tokens and auth type."""


class UserContextInjector(DiscriminatedUnionMixin, ABC):
    @abstractmethod
    def get_injector(self) -> Callable[..., UserContext | Awaitable[UserContext]]:
        """Get a resolver for instances of user service limited to the current user. Caches the user context
        in the current request as the `user_context` attribute"""

    @abstractmethod
    async def get_for_user(self, user_id: str | None) -> UserContext:
        """Get a user context for the user with the id given."""
