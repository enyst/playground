from __future__ import annotations

import os
import sys
import types
import importlib
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, Iterable, Optional

try:  # Python 3.10+
    import importlib.metadata as importlib_metadata  # type: ignore
except Exception:  # pragma: no cover
    import importlib_metadata  # type: ignore

from fastapi import FastAPI

from openhands.core.logger import openhands_logger as logger

# Type aliases
RegisterFunc = Callable[[FastAPI], None]
LifespanFactory = Callable[[FastAPI], AsyncIterator[None]]


def _load_object(path: str) -> Any:
    """Load an object from a 'module:attr' string."""
    if ':' not in path:
        raise ValueError(f"Invalid object path '{path}'. Expected 'module:attr'.")
    module_name, attr = path.split(':', 1)
    module = importlib.import_module(module_name)
    try:
        return getattr(module, attr)
    except AttributeError as e:  # pragma: no cover
        raise AttributeError(f"Attribute '{attr}' not found in module '{module_name}'.") from e


def _iter_entry_points(group: str) -> Iterable[Any]:
    """Yield loaded entry point values for a given group.

    Compatible with both old and new importlib.metadata APIs.
    """
    try:
        eps = importlib_metadata.entry_points()
        # New API supports .select
        if hasattr(eps, 'select'):
            selected = eps.select(group=group)
        else:  # Older API returns a dict-like
            selected = eps.get(group, [])  # type: ignore[attr-defined]
    except Exception as e:  # pragma: no cover
        logger.warning(f"Failed to read entry points for group '{group}': {e}")
        return []

    for ep in selected:  # type: ignore[assignment]
        try:
            yield ep.load()
        except Exception as e:  # pragma: no cover
            logger.warning(f"Failed to load entry point '{ep}': {e}")


def discover_register_funcs() -> list[RegisterFunc]:
    """Discover server extension register(app) functions.

    Sources:
    - Env var OPENHANDS_EXTENSIONS as comma-separated 'module:callable'
    - Entry point group 'openhands_server_extensions'
    """
    funcs: list[RegisterFunc] = []

    # Env var
    env_val = os.environ.get('OPENHANDS_EXTENSIONS', '').strip()
    if env_val:
        for item in (x.strip() for x in env_val.split(',') if x.strip()):
            try:
                obj = _load_object(item)
                if callable(obj):
                    funcs.append(obj)  # type: ignore[arg-type]
                else:  # pragma: no cover
                    logger.warning(
                        f"Env OPENHANDS_EXTENSIONS item '{item}' is not callable; skipping"
                    )
            except Exception as e:  # pragma: no cover
                logger.warning(f"Failed to load '{item}' from OPENHANDS_EXTENSIONS: {e}")

    # Entry points
    for obj in _iter_entry_points('openhands_server_extensions'):
        if callable(obj):
            funcs.append(obj)  # type: ignore[arg-type]
        else:  # pragma: no cover
            logger.warning(
                f"Entry point value for 'openhands_server_extensions' not callable: {obj}"
            )

    return funcs


def discover_lifespans() -> list[LifespanFactory]:
    """Discover server extension lifespans.

    Sources:
    - Env var OPENHANDS_EXTENSION_LIFESPANS as comma-separated 'module:callable'
    - Entry point group 'openhands_server_lifespans'

    Each callable must accept (app: FastAPI) and return an async context manager / async iterator.
    """
    lifespans: list[LifespanFactory] = []

    env_val = os.environ.get('OPENHANDS_EXTENSION_LIFESPANS', '').strip()
    if env_val:
        for item in (x.strip() for x in env_val.split(',') if x.strip()):
            try:
                obj = _load_object(item)
                if callable(obj):
                    lifespans.append(obj)  # type: ignore[arg-type]
                else:  # pragma: no cover
                    logger.warning(
                        f"Env OPENHANDS_EXTENSION_LIFESPANS item '{item}' is not callable; skipping"
                    )
            except Exception as e:  # pragma: no cover
                logger.warning(
                    f"Failed to load '{item}' from OPENHANDS_EXTENSION_LIFESPANS: {e}"
                )

    for obj in _iter_entry_points('openhands_server_lifespans'):
        if callable(obj):
            lifespans.append(obj)  # type: ignore[arg-type]
        else:  # pragma: no cover
            logger.warning(
                f"Entry point value for 'openhands_server_lifespans' not callable: {obj}"
            )

    return lifespans


def discover_server_config_classes() -> list[type[Any]]:
    """Discover ServerConfig implementations via entry point.

    Group: 'openhands_server_config'
    Returns a list; caller decides precedence. Not applied automatically here.
    """
    configs: list[type[Any]] = []
    for obj in _iter_entry_points('openhands_server_config'):
        if isinstance(obj, type):
            configs.append(obj)
        else:  # pragma: no cover
            logger.warning(
                f"Entry point value for 'openhands_server_config' is not a class: {obj}"
            )
    return configs


def apply_register_funcs(app: FastAPI) -> None:
    """Call all discovered register(app) functions, logging failures without crashing."""
    for func in discover_register_funcs():
        try:
            func(app)
            logger.info(
                f"Applied extension register function: {getattr(func, '__qualname__', func)}"
            )
        except Exception as e:  # pragma: no cover
            logger.warning(f"Extension register failed for {func}: {e}")


__all__ = [
    'RegisterFunc',
    'LifespanFactory',
    'discover_register_funcs',
    'discover_lifespans',
    'discover_server_config_classes',
    'apply_register_funcs',
]
