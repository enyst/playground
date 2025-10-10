from pydantic import BaseModel

from openhands.integrations.provider import PROVIDER_TOKEN_TYPE
from openhands.server.user_auth.user_auth import AuthType
from openhands.storage.data_models.settings import Settings


class Identity(BaseModel):
    id: str | None = None
    email: str | None = None
    auth_type: AuthType | None = None


class UserInfo(Settings):
    """Model for user settings including the current user id."""

    id: str | None = None


class ProviderTokenPage:
    items: list[PROVIDER_TOKEN_TYPE]
    next_page_id: str | None = None
