"""Test to verify prompt caching behavior with large responses."""

import logging
import os
import tempfile
from typing import Any, Dict

from evaluation.integration_tests.tests.base import BaseIntegrationTest, TestResult
from openhands.core.logger import openhands_logger
from openhands.core.main import auto_continue_response
from openhands.events.action import CmdRunAction, MessageAction
from openhands.events.event import Event
from openhands.runtime.base import Runtime
from openhands.controller.state.state import State


def custom_large_response(state: State, *args, **kwargs) -> str:
    """Provide large, detailed responses about what to do with each number."""
    # About 100 tokens per response
    responses = [
        "For number 1, please make it extra special by printing it in bright red color with a fancy border around it. Make sure to use ANSI escape codes to create a beautiful box drawing with double lines, and add some sparkles or stars around it for extra flair. This will make it stand out as the first number in our sequence!",
        "For number 2, let's do something magical: print it in a shimmering rainbow effect by using multiple ANSI color codes in sequence. Add a gradient effect if possible, and maybe some wave-like patterns around it using ASCII art. This will make the second number truly mesmerizing!",
        "For number 3, we should create a dramatic presentation: print it in bold purple with a pulsing effect, surrounded by a circular pattern of dots that gives it a cosmic, ethereal feeling. Maybe add some constellation-like connections between the dots!",
        "For number 4, let's go for an elegant design: print it in a sophisticated emerald green color, wrapped in an ornate frame made of ASCII art flourishes and scrollwork. Add some delicate patterns that make it look like an illuminated manuscript!",
        "For number 5, for our grand finale: combine multiple effects to create a spectacular display! Use blinking text, multiple colors, and create an elaborate ASCII art celebration around it with fireworks patterns and celebration symbols!"
    ]
    
    # Count how many times the agent has asked for input
    message_count = sum(1 for event in state.history 
                       if isinstance(event, MessageAction) 
                       and event.source == "assistant" 
                       and "what" in event.content.lower())
    
    if message_count <= len(responses):
        return responses[message_count - 1]
    return "continue"


class Test(BaseIntegrationTest):
    """Test prompt caching behavior with a task that requires multiple interactions."""

    INSTRUCTION = """Create a Python script numbers.py that prints numbers from 1 to 5, but with a twist: 
    ask me what special thing to do with each number before writing it."""

    def __init__(self) -> None:
        super().__init__()
        # Set logging to DEBUG to capture token usage
        openhands_logger.setLevel(logging.DEBUG)
        # Create a file handler to capture logs
        self.log_file = tempfile.NamedTemporaryFile(delete=False, mode='w')
        handler = logging.FileHandler(self.log_file.name)
        handler.setLevel(logging.DEBUG)
        openhands_logger.addHandler(handler)

    @classmethod
    def initialize_runtime(cls, runtime: Runtime) -> None:
        """Set up the test environment."""
        pass  # No special setup needed

    @classmethod
    def verify_result(cls, runtime: Runtime, histories: list[Event]) -> TestResult:
        """Verify the test results by analyzing the logs."""
        # First verify that the script was created and works
        action = CmdRunAction(command='python3 /workspace/numbers.py', keep_prompt=False)
        obs = runtime.run_action(action)
        if obs.exit_code != 0:
            return TestResult(
                success=False,
                reason=f'Script execution failed: {obs.content}'
            )

        # Now analyze the logs for token usage patterns
        log_file = next(f for f in os.listdir('/tmp') 
                       if os.path.isfile(os.path.join('/tmp', f)) 
                       and f.endswith('.log'))
        with open(os.path.join('/tmp', log_file), 'r') as f:
            logs = f.read()

        # Check for expected token usage patterns
        cache_writes = logs.count('Input tokens (cache write):')
        cache_hits = logs.count('Input tokens (cache hit):')
        
        # We expect:
        # 1. At least one cache write for system message
        # 2. Multiple cache hits as conversation progresses
        # 3. Cache hits should increase in later interactions
        if cache_writes == 0:
            return TestResult(
                success=False,
                reason='No cache writes found in logs'
            )
        if cache_hits == 0:
            return TestResult(
                success=False,
                reason='No cache hits found in logs'
            )

        return TestResult(success=True)

    def get_fake_user_response_fn(self) -> Any:
        """Override to provide our custom response function."""
        return custom_large_response