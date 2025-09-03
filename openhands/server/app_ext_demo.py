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
)
from openhands.server.shared import conversation_manager

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
    async with conversation_manager:
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

# Apply extension routers/middlewares
apply_register_funcs(app)
