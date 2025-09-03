"""
OpenHands Server with Extension Support

This demonstrates how to integrate the extension system into the main OpenHands server
with both register functions and lifespan support.
"""
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.routing import Mount

from openhands import __version__
from openhands.server.extensions import (
    load_extensions,
    discover_lifespans,
    combine_lifespans,
)
from openhands.server.routes.mcp import mcp_server
from openhands.server.shared import conversation_manager


mcp_app = mcp_server.http_app(path='/mcp')


@asynccontextmanager
async def _core_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Core OpenHands lifespan for conversation manager."""
    async with conversation_manager:
        yield


# Discover extension lifespans and combine with core lifespan
_extension_lifespans = discover_lifespans()
_app_lifespan = combine_lifespans(
    _core_lifespan,
    mcp_app.lifespan,
    *_extension_lifespans,
)

app = FastAPI(
    title='OpenHands with Extensions',
    description='OpenHands server with integrated extension support',
    version=__version__,
    lifespan=_app_lifespan,
    routes=[Mount(path='/mcp', app=mcp_app)],
)

# Load all discovered extensions
loaded_extensions = load_extensions(app)

# Add extension status endpoint
@app.get("/extensions/status")
async def extension_status():
    """Get status of loaded extensions."""
    return {
        "loaded_extensions": loaded_extensions,
        "extension_count": len(loaded_extensions),
        "lifespan_count": len(_extension_lifespans),
        "app_state": getattr(app.state, 'extensions', {}) if hasattr(app.state, 'extensions') else {}
    }