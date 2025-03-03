import asyncio

from openhands.controller import AgentController
from openhands.core.logger import openhands_logger as logger
from openhands.core.schema import AgentState
from openhands.runtime.base import Runtime


async def run_agent_until_done(
    controller: AgentController,
    runtime: Runtime,
    end_states: list[AgentState],
    timeout_seconds: int = 60,  # Default timeout of 60 seconds
):
    """
    run_agent_until_done takes a controller and a runtime, and will run
    the agent until it reaches a terminal state.
    Note that runtime must be connected before being passed in here.
    
    Args:
        controller: The agent controller to run
        runtime: The runtime to use (must be connected)
        end_states: List of states that indicate the agent is done
        timeout_seconds: Maximum time to wait for the agent to finish (in seconds)
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

    # Track iterations to detect potential infinite loops
    iteration_count = 0
    max_iterations = 300  # Reasonable upper limit (5 minutes at 1 second per iteration)
    
    # Start time for timeout tracking
    start_time = asyncio.get_event_loop().time()
    
    while controller.state.agent_state not in end_states:
        # Check for timeout
        current_time = asyncio.get_event_loop().time()
        elapsed_time = current_time - start_time
        
        if elapsed_time > timeout_seconds:
            logger.error(f"Agent execution timed out after {elapsed_time:.1f} seconds")
            await controller.set_agent_state_to(AgentState.ERROR)
            controller.state.last_error = f"Execution timed out after {elapsed_time:.1f} seconds"
            
            # Add a NullAction to break any potential loops
            if hasattr(controller, 'headless_mode') and controller.headless_mode and hasattr(runtime, 'event_stream'):
                from openhands.events.action import NullAction
                from openhands.events import EventSource
                logger.info("Adding NullAction to break potential loops after timeout")
                runtime.event_stream.add_event(NullAction(), EventSource.AGENT)
            break
            
        # Check for too many iterations (possible infinite loop)
        iteration_count += 1
        if iteration_count > max_iterations:
            logger.error(f"Agent execution exceeded {max_iterations} iterations, likely stuck in a loop")
            await controller.set_agent_state_to(AgentState.ERROR)
            controller.state.last_error = f"Execution exceeded {max_iterations} iterations, likely stuck in a loop"
            
            # Add a NullAction to break any potential loops
            if hasattr(controller, 'headless_mode') and controller.headless_mode and hasattr(runtime, 'event_stream'):
                from openhands.events.action import NullAction
                from openhands.events import EventSource
                logger.info("Adding NullAction to break potential loops after max iterations")
                runtime.event_stream.add_event(NullAction(), EventSource.AGENT)
            break
            
        await asyncio.sleep(1)
