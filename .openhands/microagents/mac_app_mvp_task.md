---
name: mac_app_mvp
type: task
agent: CodeActAgent
---
# OpenHands Mac App MVP Definition

This document defines the MVP features for the OpenHands Mac application.

## Core MVP Features

For the initial MVP release of the OpenHands Mac application, we will focus on the following core features:

1.  **Task Input Area:**
    *   Description: A text area for users to input tasks.
    *   Functionality:  Accepts natural language task instructions.

2.  **Agent Output Display:**
    *   Description: Display area for agent's step-by-step actions and outputs.
    *   Functionality: Real-time display of agent's progress, including command executions and code changes.

3.  **Basic File Explorer:**
    *   Description: A simplified file tree view.
    *   Functionality: File system navigation and file opening (viewing file content).  No file creation, deletion, or renaming in MVP.

4.  **Start/Stop Control Buttons:**
    *   Description: Buttons to control agent execution.
    *   Functionality:
        *   Start: Initiate agent execution.
        *   Stop: Terminate agent execution.

5.  **Backend Connection Settings:**
    *   Description: Basic settings to connect to the OpenHands backend.
    *   Functionality:
        *   Option to specify the backend host (initially assume local backend for MVP).

## Excluded from MVP

The following features, while planned for the full application, will be excluded from the MVP to focus on core functionality and expedite the initial release:

*   Advanced File Management (create, delete, rename)
*   Settings Panel (beyond basic backend connection)
*   Prompt Configuration Area (MicroAgent management)
*   Memory Area visualization
*   Pause/Resume and Step control buttons
*   Terminal/Command Output section (agent output display will suffice for MVP)

## MVP Focus

The primary focus of the MVP is to provide a functional Mac application that allows users to:

*   Input tasks for the OpenHands agent.
*   Observe the agent's execution and output in real-time.
*   Navigate and view files within the workspace.
*   Start and stop the agent.
*   Connect to a local OpenHands backend.

This MVP will serve as a foundation for future iterations and feature additions.

---