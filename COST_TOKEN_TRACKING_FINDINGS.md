# Cost and Token Tracking Analysis & Findings

## Executive Summary

This document outlines the findings of an investigation into cost and token tracking within the OpenHands application. A bug was identified that could lead to underreporting of accumulated costs and tokens when a session did not terminate via a standard `AgentFinishAction` or `AgentRejectAction` (e.g., due to an error or user-initiated stop).

A fix has been implemented in `openhands/controller/agent_controller.py` to ensure that metrics from the last active step are correctly merged into the global session metrics before being persisted. Other aspects of metric handling, including delegate agent metrics and persistence mechanisms, were found to be largely robust.

## Investigation Details

The investigation focused on how `cost`, `accumulated_cost`, and `tokens` are calculated, tracked, persisted, and displayed. Key areas of focus included:

- Metric persistence across sessions.
- LLM constructor and metric object initialization.
- `AgentController` logic, especially concerning `state.metrics`, `state.local_metrics`, and the `agent.reset()` method.
- `agent_session.py` as the entry point for application logic.

### Identified Bug: Loss of `local_metrics` on Error/Stop

1.  **Metric Objects**:
    *   The `State` object (in `openhands/controller/state/state.py`) maintains two key `Metrics` attributes:
        *   `metrics`: Intended to store the global accumulated metrics for the entire task/session.
        *   `local_metrics`: Intended to store metrics for the current agent's single step or sub-task.
    *   Each `LLM` instance possesses its own `Metrics` object (`llm.metrics`) where it records costs and tokens for its operations.

2.  **Normal Metric Flow**:
    *   After an agent's LLM call, `AgentController.update_state_after_step()` deepcopies `agent.llm.metrics` into `state.local_metrics`.
    *   If the agent's step results in an `AgentFinishAction` or `AgentRejectAction`, the `_handle_action` method in `AgentController` merges `state.local_metrics` into the global `state.metrics`. This is correct.

3.  **Problematic Flow (Error/Stop)**:
    *   If an agent encounters an error or is stopped by the user, `AgentController.set_agent_state_to()` is called with `AgentState.ERROR` or `AgentState.STOPPED`.
    *   In this path, `update_state_after_step()` is called (copying current LLM metrics to `state.local_metrics`), and then `agent.reset()` is called (which resets `agent.llm.metrics`).
    *   **Crucially, before the fix, there was no explicit merge of `state.local_metrics` into `state.metrics` in this error/stop path.**
    *   Consequently, when the `State` object was persisted (via `State.save_to_session()`), the `state.metrics` would not include the costs/tokens from the very last (potentially incomplete) step captured in `state.local_metrics`. The `state.local_metrics` itself *was* persisted, but its values were effectively orphaned from the main accumulated totals for the session.

4.  **Impact**:
    *   This would lead to the `accumulated_cost` and token counts reported from the persisted `state.metrics` (e.g., by `agent_session.py` or other server-side components) being lower than the true values, as the cost of the last operation before an abnormal termination was missing.
    *   Metrics displayed on the frontend (derived from `action.llm_metrics`, which reflect the live state of `agent.llm.metrics` at the time of an action) might transiently show higher values than what would be stored and reported as the final accumulated cost if the session ended via error/stop.

### Implemented Fix

The `set_agent_state_to` method in `openhands/controller/agent_controller.py` has been modified. In the conditional block for `AgentState.STOPPED` or `AgentState.ERROR`, the line `self.state.metrics.merge(self.state.local_metrics)` was added.

This ensures that `state.local_metrics` (containing the metrics from the last step before the agent/LLM reset) is merged into the global `state.metrics` *before* the agent's LLM metrics are reset and *before* the state is eventually saved.

```python
# Snippet from openhands/controller/agent_controller.py
# Inside set_agent_state_to method:

        if new_state in (AgentState.STOPPED, AgentState.ERROR):
            # sync existing metrics BEFORE resetting the agent
            await self.update_state_after_step() # Copies agent.llm.metrics to state.local_metrics
            self.state.metrics.merge(self.state.local_metrics) # Ensures local_metrics are added to global
            self._reset() # Resets agent.llm.metrics
```

## Other Findings

-   **Metric Persistence**: Metrics (both global `state.metrics` and `state.local_metrics`) are persisted as part of the pickled `State` object when a session ends. History is rebuilt from the event stream. This mechanism is sound.
-   **LLM Metric Initialization**: Each `LLM` instance correctly initializes its own `Metrics` object. This is true for primary agents, condensers, and delegate agents.
-   **Delegate Agent Metrics**: Delegate agents share the `state.metrics` object of their parent controller. The implemented fix for `set_agent_state_to` also applies to delegate controllers, ensuring their `local_metrics` are merged into the shared `state.metrics` upon error/stop. If a delegate finishes or rejects normally, its `local_metrics` are also merged into the shared `state.metrics`. This ensures delegate costs are correctly rolled up into the main task's metrics.
-   **`draft_editor` LLM**: The issue mentioned this LLM. Assuming it is disabled via configuration (as suggested in the issue), it does not contribute to metric calculations. If it were active, it would be treated like any other agent LLM.

## Conclusion

The primary identified bug causing underreporting of costs and tokens in specific termination scenarios has been addressed by ensuring `state.local_metrics` are merged into `state.metrics` prior to state persistence in all relevant agent lifecycle events (finish, reject, error, stop). The overall architecture for metric collection and persistence, especially with the fix, appears robust.
