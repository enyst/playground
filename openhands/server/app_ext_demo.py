from __future__ import annotations

import contextlib
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Depends
from fastapi.routing import Mount

from openhands import __version__
from openhands.server.extensions import (
    apply_register_funcs,
    discover_lifespans,
    discover_component_contributions,
)
# Conversation manager lifespan is optional for the demo to avoid heavy deps at import time.
try:
    from openhands.server.shared import conversation_manager  # type: ignore
except Exception:  # pragma: no cover
    conversation_manager = None  # type: ignore

# MCP may have optional dependencies; attempt import but continue if unavailable.
try:
    from openhands.server.routes.mcp import mcp_server
    mcp_app = mcp_server.http_app(path='/mcp')
except Exception:  # pragma: no cover
    mcp_app = None


def combine_lifespans(*lifespans):
    @contextlib.asynccontextmanager
    async def combined_lifespan(app):
        async with contextlib.AsyncExitStack() as stack:
            for lifespan in lifespans:
                await stack.enter_async_context(lifespan(app))
            yield

    return combined_lifespan


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    if conversation_manager is None:
        yield
    else:
        async with conversation_manager:  # type: ignore
            yield


# Build app with extension lifespans discovered dynamically
_extension_lifespans = discover_lifespans()
lifespans = [_lifespan]
if mcp_app is not None:
    lifespans.append(mcp_app.lifespan)
_app_lifespan = combine_lifespans(*lifespans)

from openhands.server.di import resolve_context

app = FastAPI(
    title='OpenHands (Demo with Extensions)',
    description='OpenHands with extension loader (demo module, not default entrypoint)',
    version=__version__,
    lifespan=_app_lifespan,
    dependencies=[Depends(resolve_context)],  # Global, non-enforcing context
    routes=([Mount(path='/mcp', app=mcp_app)] if mcp_app is not None else []),
)

# Apply ComponentContribution routers (additive). Singletons would be handled with first-wins policy in future step.
for contrib in discover_component_contributions():
    for prefix, router in getattr(contrib, 'routers', []):
        app.include_router(router, prefix=prefix)

# Apply extension routers/middlewares
apply_register_funcs(app)
