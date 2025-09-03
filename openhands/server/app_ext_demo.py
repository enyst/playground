from __future__ import annotations

import contextlib
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.routing import Mount

from openhands import __version__
from openhands.server.extensions import (
    apply_register_funcs,
    discover_lifespans,
)
from openhands.server.routes.mcp import mcp_server
from openhands.server.shared import conversation_manager


mcp_app = mcp_server.http_app(path='/mcp')


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
_app_lifespan = combine_lifespans(
    _lifespan,
    mcp_app.lifespan,
    *_extension_lifespans,
)

app = FastAPI(
    title='OpenHands (Demo with Extensions)',
    description='OpenHands with extension loader (demo module, not default entrypoint)',
    version=__version__,
    lifespan=_app_lifespan,
    routes=[Mount(path='/mcp', app=mcp_app)],
)

# Apply extension routers/middlewares
apply_register_funcs(app)
