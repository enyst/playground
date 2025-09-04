"""
OpenHands Extension System

This module provides the foundation for loading and managing OpenHands extensions.
Extensions can add routes, middleware, and functionality without modifying the core.
"""

from __future__ import annotations

import contextlib
import os
import sys
import types
import importlib
from dataclasses import dataclass
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, Iterable, Optional, Sequence, Tuple

try:  # Python 3.10+
    import importlib.metadata as importlib_metadata  # type: ignore
    HAS_METADATA = True
except ImportError:  # pragma: no cover
    try:
        import importlib_metadata  # type: ignore
        HAS_METADATA = True
    except ImportError:
        HAS_METADATA = False

from fastapi import FastAPI

try:
    from openhands.core.logger import openhands_logger as logger
except Exception:  # pragma: no cover
    import logging as _logging
    logger = _logging.getLogger('openhands.extensions')
    
if not HAS_METADATA:
    logger.warning('importlib.metadata not available. Entry point discovery disabled.')

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
    if not HAS_METADATA:
        return
        
    try:
        eps = importlib_metadata.entry_points()
        # New API supports .select
        if hasattr(eps, 'select'):
            selected = eps.select(group=group)
        else:  # Older API returns a dict-like
            selected = eps.get(group, [])  # type: ignore[attr-defined]
    except Exception as e:  # pragma: no cover
        logger.warning(f"Failed to read entry points for group '{group}': {e}")
        return

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

@dataclass
class ComponentContribution:
    routers: list[tuple[str, Any]]
    conversation_manager_name: Optional[str] = None


def discover_component_contributions() -> list[ComponentContribution]:
    """Discover component contributions from entry point group 'openhands_components'.

    This is a demo API; future work can add env var sourcing and validation.
    """
    contributions: list[ComponentContribution] = []
    for obj in _iter_entry_points('openhands_components'):
        try:
            contrib = obj()
            # Basic shape validation
            if not hasattr(contrib, 'routers'):
                logger.warning('ComponentContribution missing routers; skipping')
                continue
            contributions.append(contrib)
        except Exception as e:  # pragma: no cover
            logger.warning(f"Failed to load component contribution: {e}")
    return contributions



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


def combine_lifespans(*lifespans):
    """Combine multiple lifespan functions into a single lifespan."""

    @contextlib.asynccontextmanager
    async def combined_lifespan(app):
        async with contextlib.AsyncExitStack() as stack:
            for lifespan in lifespans:
                await stack.enter_async_context(lifespan(app))
            yield

    return combined_lifespan


def load_extensions(app: FastAPI) -> list[str]:
    """
    Load and register all available OpenHands extensions.

    Extensions can be discovered through:
    1. Environment variable: OPENHANDS_EXTENSIONS (comma-separated list of module:function)
    2. Entry points: openhands_server_extensions

    Args:
        app: FastAPI application instance

    Returns:
        List of successfully loaded extension names
    """
    loaded_extensions = []

    # Use existing apply_register_funcs for compatibility
    try:
        apply_register_funcs(app)
        # Get the names of loaded extensions
        for func in discover_register_funcs():
            loaded_extensions.append(getattr(func, '__qualname__', str(func)))
    except Exception as e:
        logger.error(f"Failed to load extensions: {e}")

    if loaded_extensions:
        logger.info(f'Total extensions loaded: {len(loaded_extensions)}')
    else:
        logger.debug('No extensions loaded')

    return loaded_extensions


def get_extension_info(app: FastAPI) -> dict:
    """
    Get information about loaded extensions.

    Args:
        app: FastAPI application instance

    Returns:
        Dictionary with extension information
    """
    info = {
        'extension_system': 'enabled',
        'discovery_methods': ['environment_variable', 'entry_points'],
        'register_extensions': {
            'environment_variable': 'OPENHANDS_EXTENSIONS',
            'entry_point_group': 'openhands_server_extensions',
        },
        'lifespan_extensions': {
            'environment_variable': 'OPENHANDS_EXTENSION_LIFESPANS',
            'entry_point_group': 'openhands_server_lifespans',
        },
        'metadata_available': HAS_METADATA,
    }

    # Check if any extensions are configured
    extensions_env = os.getenv('OPENHANDS_EXTENSIONS', '')
    if extensions_env.strip():
        info['configured_register_extensions'] = [
            ext.strip() for ext in extensions_env.split(',') if ext.strip()
        ]

    lifespans_env = os.getenv('OPENHANDS_EXTENSION_LIFESPANS', '')
    if lifespans_env.strip():
        info['configured_lifespan_extensions'] = [
            ext.strip() for ext in lifespans_env.split(',') if ext.strip()
        ]

    return info


__all__ = [
    'RegisterFunc',
    'LifespanFactory',
    'discover_register_funcs',
    'discover_lifespans',
    'discover_server_config_classes',
    'apply_register_funcs',
    'combine_lifespans',
    'load_extensions',
    'get_extension_info',
]
