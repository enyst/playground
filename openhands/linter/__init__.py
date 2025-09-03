"""Linter module for OpenHands.

Part of this Linter module is adapted from Aider (Apache 2.0 License, [original
code](https://github.com/paul-gauthier/aider/blob/main/aider/linter.py)).
- Please see the [original repository](https://github.com/paul-gauthier/aider) for more information.
- The detailed implementation of the linter can be found at: https://github.com/All-Hands-AI/openhands-aci.
"""

try:
    from openhands_aci.linter import DefaultLinter, LintResult  # type: ignore
except Exception:  # pragma: no cover
    from dataclasses import dataclass
    from typing import List

    @dataclass
    class LintResult:  # type: ignore[no-redef]
        line: int
        column: int
        message: str

    class DefaultLinter:  # type: ignore[no-redef]
        def lint(self, file_path: str) -> list[LintResult]:
            # Fallback: no-op linter
            return []

__all__ = ['DefaultLinter', 'LintResult']
