import asyncio
import time

from openhands.controller import AgentController
from openhands.core.logger import openhands_logger as logger
from openhands.core.schema import AgentState
from openhands.events import EventSource
from openhands.events.action import NullAction
from openhands.runtime.base import Runtime


async def run_agent_until_done(
    controller: AgentController,
    runtime: Runtime,
    end_states: list[AgentState],
    timeout_seconds: int = 300,
    max_iterations: int = 1000,
):
    """
    run_agent_until_done takes a controller and a runtime, and will run
    the agent until it reaches a terminal state.
    Note that runtime must be connected before being passed in here.

    Args:
        controller: The agent controller to run
        runtime: The runtime to use
        end_states: List of states that indicate the agent is done
        timeout_seconds: Maximum time to wait for the agent to finish (default: 300s)
        max_iterations: Safety limit to prevent infinite loops (default: 1000)
    """

    def status_callback(msg_type, msg_id, msg):
        if msg_type == 'error':
            logger.error(msg)
            if controller:
                controller.state.last_error = msg
                asyncio.create_task(controller.set_agent_state_to(AgentState.ERROR))
        else:
            logger.info(msg)

    if hasattr(runtime, 'status_callback') and runtime.status_callback:
        raise ValueError(
            'Runtime status_callback was set, but run_agent_until_done will override it'
        )
    if hasattr(controller, 'status_callback') and controller.status_callback:
        raise ValueError(
            'Controller status_callback was set, but run_agent_until_done will override it'
        )

    runtime.status_callback = status_callback
    controller.status_callback = status_callback

    # Track start time for timeout
    start_time = asyncio.get_event_loop().time()
    wall_clock_start = time.time()  # Backup wall clock time for safety
    iteration = 0

    # Log the timeout and iteration limits
    logger.info(
        f'Starting agent loop with timeout={timeout_seconds}s, max_iterations={max_iterations}'
    )

    while controller.state.agent_state not in end_states:
        # Check for timeout using event loop time
        current_time = asyncio.get_event_loop().time()
        elapsed_time = current_time - start_time

        # Also check wall clock time as a backup
        wall_clock_elapsed = time.time() - wall_clock_start

        # Use the maximum of the two elapsed times for safety
        actual_elapsed = max(elapsed_time, wall_clock_elapsed)

        if actual_elapsed > timeout_seconds:
            logger.warning(f'Timeout after {actual_elapsed:.1f} seconds')
            controller.state.last_error = f'Timeout after {actual_elapsed:.1f} seconds'
            await controller.set_agent_state_to(AgentState.ERROR)

            # In headless mode, emit a NullAction to break potential loops
            if (
                hasattr(runtime, 'event_stream')
                and hasattr(controller, 'headless_mode')
                and controller.headless_mode
            ):
                logger.info('Emitting NullAction due to timeout in headless mode')
                null_action = NullAction()
                null_action._source = EventSource.AGENT  # type: ignore [attr-defined]
                runtime.event_stream.add_event(null_action, EventSource.AGENT)
            break

        # Check for max iterations (safety limit)
        iteration += 1
        if iteration > max_iterations:
            logger.warning(f'Reached maximum iterations limit ({max_iterations})')
            controller.state.last_error = (
                f'Reached maximum iterations limit ({max_iterations})'
            )
            await controller.set_agent_state_to(AgentState.ERROR)

            # In headless mode, emit a NullAction to break potential loops
            if (
                hasattr(runtime, 'event_stream')
                and hasattr(controller, 'headless_mode')
                and controller.headless_mode
            ):
                logger.info(
                    'Emitting NullAction due to max iterations in headless mode'
                )
                null_action = NullAction()
                null_action._source = EventSource.AGENT  # type: ignore [attr-defined]
                runtime.event_stream.add_event(null_action, EventSource.AGENT)
            break

        # Check if we're in a terminal state but somehow missed it
        if controller.state.agent_state in end_states:
            logger.info(f'Agent reached terminal state: {controller.state.agent_state}')
            break

        await asyncio.sleep(1)
