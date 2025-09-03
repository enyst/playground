from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status


@dataclass
class RequestContext:
    principal: Optional[str] = None
    tenant_id: Optional[str] = None
    roles: list[str] = field(default_factory=list)


@dataclass
class ServiceRegistry:
    """Application-scoped service registry for singleton providers.

    Keep this minimal. Extensions can set first-wins singletons by assigning
    attributes when they are None. Additive lists can be normal Python lists.
    """

    # Example singleton slot (first-wins): a conversation manager implementation name
    # or fully-qualified path. This is only an example placeholder and is not
    # consumed by the demo app. It proves first-wins behavior for singletons.
    conversation_manager_name: Optional[str] = None

    # Example arbitrary metadata to prove contribution occurred
    notes: list[str] = field(default_factory=list)


# -------- Request-scope DI helpers --------

def resolve_context(request: Request) -> None:
    """Global, non-enforcing context resolver.

    Extracts identity/tenant hints from headers for demo purposes.
    Never raises. Sets request.state.ctx used by providers/enforcers.
    """
    hdr_user = request.headers.get("X-User")
    hdr_tenant = request.headers.get("X-Tenant")
    roles = request.headers.get("X-Roles", "").split(",") if request.headers.get("X-Roles") else []

    request.state.ctx = RequestContext(
        principal=hdr_user,
        tenant_id=hdr_tenant or (hdr_user or None),  # default tenant == user for demo
        roles=[r.strip() for r in roles if r.strip()],
    )


def get_ctx(request: Request) -> RequestContext:
    ctx = getattr(request.state, "ctx", None)
    if ctx is None:
        ctx = RequestContext()
        request.state.ctx = ctx
    return ctx


def auth_required(ctx: RequestContext = Depends(get_ctx)) -> None:
    if not ctx.principal:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
