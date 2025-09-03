from __future__ import annotations

from typing import Optional

from fastapi import Request

from .di import ServiceRegistry


def get_services(request: Request) -> ServiceRegistry:
    # Attach a registry if not present
    reg: Optional[ServiceRegistry] = getattr(request.app.state, "services", None)
    if reg is None:
        reg = ServiceRegistry()
        request.app.state.services = reg
    return reg
