"""Test to verify prompt caching behavior with large responses."""

import glob
import logging
import os
import tempfile

# Override the default response function for CodeActAgent
from evaluation.integration_tests.run_infer import FAKE_RESPONSES
from evaluation.integration_tests.tests.base import BaseIntegrationTest, TestResult
from openhands.controller.state.state import State
from openhands.core.logger import openhands_logger
from openhands.events.action import CmdRunAction, MessageAction
from openhands.events.event import Event
from openhands.runtime.base import Runtime


def custom_large_response(state: State, *args, **kwargs) -> str:
    """Provide larger, detailed responses about what to do with each number."""
    # About 100 tokens per response
    responses = [
        'For number 1, please make it extra special by printing it in bright red color with a fancy border around it. Make sure to use ANSI escape codes to create a beautiful box drawing with double lines, and add some sparkles or stars around it for extra flair. This will make it stand out as the first number in our sequence!',
        "For number 2, let's do something magical: print it in a shimmering rainbow effect by using multiple ANSI color codes in sequence. Add a gradient effect if possible, and maybe some wave-like patterns around it using ASCII art. This will make the second number truly mesmerizing!",
        'For number 3, we should create a dramatic presentation: print it in bold purple with a pulsing effect, surrounded by a circular pattern of dots that gives it a cosmic, ethereal feeling. Maybe add some constellation-like connections between the dots!',
        "For number 4, let's go for an elegant design: print it in a sophisticated emerald green color, wrapped in an ornate frame made of ASCII art flourishes and scrollwork. Add some delicate patterns that make it look like an illuminated manuscript!",
        'For number 5, for our grand finale: combine multiple effects to create a spectacular display! Use blinking text, multiple colors, and create an elaborate ASCII art celebration around it with fireworks patterns and celebration symbols!',
    ]

    # Count how many times the agent has asked for input
    message_count = sum(
        1
        for event in state.history
        if isinstance(event, MessageAction)
        and event.source == 'assistant'
        and 'what' in event.content.lower()
    )

    if message_count <= len(responses):
        return responses[message_count - 1]
    return 'continue'


# Provide a custom response function for the CodeActAgent
FAKE_RESPONSES['CodeActAgent'] = custom_large_response


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
        action = CmdRunAction(
            command='python3 /workspace/numbers.py', keep_prompt=False
        )
        obs = runtime.run_action(action)
        if obs.exit_code != 0:
            return TestResult(
                success=False, reason=f'Script execution failed: {obs.content}'
            )

        # Now analyze the logs for token usage patterns
        log_pattern = os.path.join(
            'evaluation/evaluation_outputs/outputs/integration_tests/CodeActAgent',
            '*haiku*_maxiter_*/infer_logs/instance_t07_prompt_caching.log',
        )
        log_files = glob.glob(log_pattern)
        if not log_files:
            return TestResult(
                success=False,
                reason=f'No log file found matching pattern: {log_pattern}',
            )

        # We found it, read it
        log_file = log_files[0]
        with open(log_file, 'r') as f:
            logs = f.read()

        # the log messages look like this:
        # 2024-12-13 16:50:26,651 - INFO - Input tokens: 5213 | Output tokens: 182
        # Input tokens (cache hit): 5028
        # Input tokens (cache write): 180

        # Check for expected token usage patterns
        cache_writes_no = logs.count('Input tokens (cache write):')
        cache_hits_no = logs.count('Input tokens (cache hit):')

        cache_writes_values = []
        cache_hits_values = []
        input_tokens_values = []
        output_tokens_values = []

        # Get values, and context around token usage
        log_lines = logs.split('\n')
        context = []
        for i, line in enumerate(log_lines):
            if 'Accumulated cost' in line:
                start = max(0, i - 10)
                end = min(len(log_lines), i + 10)
                context.extend(log_lines[start:end])
                context.append('-' * 40)  # separator between contexts

            # get the values after the 'Input tokens (cache write):' and 'Input tokens (cache hit):'
            if 'Input tokens (cache write):' in line:
                cache_writes_values.append(
                    int(line.split('Input tokens (cache write): ')[1].strip())
                )
            if 'Input tokens (cache hit):' in line:
                cache_hits_values.append(
                    int(line.split('Input tokens (cache hit): ')[1].strip())
                )

            # get the values after the 'Input tokens: ' and 'Output tokens: '
            # the line looks like this:
            # 2024-12-13 16:50:26,651 - INFO - Input tokens: 5213 | Output tokens: 182
            if 'Input tokens:' in line:
                input_tokens_values.append(
                    int(line.split('Input tokens: ')[1].split(' |')[0].strip())
                )
            if 'Output tokens:' in line:
                output_tokens_values.append(
                    int(line.split('Output tokens: ')[1].split(' |')[0].strip())
                )

        # We expect:
        # 1. At least one cache write for system message
        # 2. Multiple cache hits as conversation progresses
        # 3. Cache hits should increase in later interactions
        if cache_writes_no == 0:
            return TestResult(
                success=False,
                reason='No cache writes found in logs.\nContext around token usage:\n'
                + '\n'.join(context),
            )
        if cache_hits_no == 0:
            return TestResult(
                success=False,
                reason='No cache hits found in logs.\nContext around token usage:\n'
                + '\n'.join(context),
            )

        # check if the input tokens are increasing
        if not all(
            input_tokens_values[i] <= input_tokens_values[i + 1]
            for i in range(len(input_tokens_values) - 1)
        ):
            return TestResult(
                success=False,
                reason='Input tokens are not increasing.\nContext around token usage:\n'
                + '\n'.join(context),
            )

        # check if the cache hits are increasing
        if not all(
            cache_hits_values[i] <= cache_hits_values[i + 1]
            for i in range(len(cache_hits_values) - 1)
        ):
            return TestResult(
                success=False,
                reason='Cache hits are not increasing.\nContext around token usage:\n'
                + '\n'.join(context),
            )

        # check if the cache hits are always the sum of the previous line's input tokens and previous line's cache hits
        for i in range(1, len(cache_hits_values)):
            if (
                cache_hits_values[i]
                != input_tokens_values[i - 1] + cache_hits_values[i - 1]
            ):
                return TestResult(
                    success=False,
                    reason=f"Cache hits are not the sum of the previous line's input tokens {input_tokens_values[i-1]} and previous line's cache hits {cache_hits_values[i-1]}.\nContext around token usage:\n"
                    + '\n'.join(context),
                )
        return TestResult(success=True)
