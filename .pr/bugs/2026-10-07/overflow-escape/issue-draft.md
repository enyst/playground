I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

## Operating System

Linux, OpenAI hosted cloud executor; headless Chromium.

## Installation Method

Other: source checkout launched with the repository's `verify-openhands` skill, using `control-openhands launch --new`. This starts the real Canvas source build and bundled Agent Server. This reproduction does not claim the issue template's `ready-for-dev` run-method gate: it was not repeated using `npx @openhands/agent-canvas`, `npm run dev` / `npm run dev:minimal`, or hosted Canvas.

## Agent Canvas Version

Agent Canvas 1.25.0, OpenHands/OpenHands main at `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c`; bundled Agent Server 1.53.0. Node 24.19.0. Actual selected backend: Local. Viewport: 320 × 700 CSS pixels.

## Bug Description

At narrow width, the conversation composer's **More input actions** button opens a menu containing **Model**. Pressing Escape leaves this menu open. Clicking its trigger again closes it. Two agents independently reproduced the failure on separate fresh Local stacks at the same revision on 2026-10-07.

**Regression:** origin unconfirmed. There is no live pre-change/baseline reproduction, so this report does not claim a regression. Commit `60b6a93f377f29f380d97fe8264a3adecf8f2b60` ([#18015](https://github.com/OpenHands/OpenHands/pull/18015)) fixed this menu immediately closing after its opening click by excluding the trigger from outside-click handling; that change does not implement Escape handling. At the tested revision, `chat-input-actions.tsx` uses outside-click dismissal but does not use the shared `useCloseOnEscape` hook. These source observations explain the current path; they do not establish when the defect began.

This is separate from the repaired `+` tools menu (#18094 / #18095) and the overflow Model submenu geometry issue #18063. Existing open and closed issues were searched before preparing this report; #17925 concerns opening/closing on the trigger, and #17933 concerns other popups.

## Steps to Reproduce

The following commands describe the live run method. Run from the checked-out repository with Node >=24, locked dependencies installed (`npm ci --ignore-scripts`), `uv`/`uvx`, and a supported Chromium. Preserve configured proxy and CA trust. `DEEPSEEK_API_KEY` must already be supplied through the environment. The fixture makes one genuine, bounded DeepSeek request; its key remains in the private run directory and is not printed. No mocked response is used.

```sh
export PATH="$PWD/.agents/skills/verify-openhands/scripts:$PATH"
export OH_VERIFY_HOME="$(mktemp -d /tmp/overflow-escape.XXXXXX)"
# This was the supported browser discovered in the hosted executor:
export CONTROL_OPENHANDS_BROWSER=/usr/bin/chromium
# The executor's configured CA; omit this assignment when no extra CA is used:
export CONTROL_OPENHANDS_TRUST_CA="$NODE_EXTRA_CA_CERTS"
export OH_VERIFY_RUN="$(control-openhands launch --new --print-run)"
control-openhands doctor
control-openhands onboard --skip
```

Create a genuine completed conversation without tool execution, title generation, retries, or follow-up requests. This is fixture arrangement for the menu check, not proof of the composer's Send action. The primary run used a `fixture-ok` reply; the independent capture below used the same bounded setup with a `pong` reply.

```sh
umask 077
python - <<'PY'
import json
import os
from pathlib import Path

run = Path(os.environ['OH_VERIFY_RUN'])
llm = {
    'model': 'deepseek/deepseek-flash',
    'api_key': os.environ['DEEPSEEK_API_KEY'],
    'max_output_tokens': 128,
    'num_retries': 0,
    'caching_prompt': False,
    'reasoning_effort': 'none',
    'timeout': 30,
}
body = {
    'agent': {
        'kind': 'Agent',
        'llm': llm,
        'tools': [],
        'include_default_tools': [],
        'agent_context': None,
        'condenser': None,
        'critic': None,
    },
    'workspace': {'kind': 'LocalWorkspace', 'working_dir': str(run / 'workspace')},
    'client_tools': [],
    'agent_definitions': [],
    'plugins': [],
    'hook_config': None,
    'security_analyzer': None,
    'confirmation_policy': {'kind': 'NeverConfirm'},
    'autotitle': False,
    'max_iterations': 1,
    'worktree': False,
    'initial_message': {
        'role': 'user',
        'content': [{'type': 'text', 'text': 'Reply with only: fixture-ok'}],
        'run': True,
    },
}
for name, value in [
    ('bounded-fixture.json', body),
    ('bounded-profile.json', {'llm': llm, 'include_secrets': True}),
]:
    path = run / 'private' / name
    path.write_text(json.dumps(value))
    path.chmod(0o600)
PY
# Saving/activating the profile does not run model validation.
control-openhands api POST /api/profiles/deepseek-flash --write \
  --data "@$OH_VERIFY_RUN/private/bounded-profile.json" > /dev/null
control-openhands api POST /api/profiles/deepseek-flash/activate --write \
  --data '{}' > /dev/null
control-openhands api POST /api/conversations --write \
  --data "@$OH_VERIFY_RUN/private/bounded-fixture.json" --pick id \
  > "$OH_VERIFY_RUN/private/fixture-result.json"
export F05_CONVERSATION_ID="$(python - <<'PY'
import json
import os
from pathlib import Path
print(json.loads((Path(os.environ['OH_VERIFY_RUN']) / 'private' / 'fixture-result.json').read_text())['value'])
PY
)"
control-openhands conversation wait "$F05_CONVERSATION_ID" --timeout 45
control-openhands api GET "/api/conversations/$F05_CONVERSATION_ID" --pick stats
```

Drive the actual UI:

```sh
control-openhands browser goto "/conversations/$F05_CONVERSATION_ID"
control-openhands browser wait 'testid=chat-interface' --state visible --timeout 10000
control-openhands browser viewport narrow
# narrow is the skill's 320 × 700 preset.
control-openhands browser click 'role=button[name="More input actions"]'
control-openhands browser count 'testid=chat-input-overflow-menu'
# Actual: 1
control-openhands browser press Escape
control-openhands browser count 'testid=chat-input-overflow-menu'
# Actual: 1; expected: 0
control-openhands browser screenshot --feature F05.overflow-menu --name after-escape
# Existing workaround:
control-openhands browser click 'role=button[name="More input actions"]'
control-openhands browser count 'testid=chat-input-overflow-menu'
# Actual: 0
control-openhands stop
```

The regular 390-pixel phone preset can keep the actions inline; use the specified 320-pixel narrow preset to expose this overflow menu. Stop the run after the check; retain only reviewed evidence and keep its private directory out of GitHub.

## Actual Behavior

After opening **More input actions** and pressing Escape, `chat-input-overflow-menu` remains mounted and visible (`count: 1`). The independently captured screenshot below shows the menu still open after Escape. The same result was observed on two fresh Local stacks. Toggling the trigger closes it.

## Expected Behavior

Escape dismisses the open **More input actions** menu and returns keyboard focus to its trigger, consistently with the other composer menus.

## Relevant Logs

Observed CLI sequence on both fresh stacks:

```text
Viewport: narrow, 320x700
Selected backend: Local
Open More input actions: chat-input-overflow-menu count = 1
Press Escape:           chat-input-overflow-menu count = 1
Click trigger again:    chat-input-overflow-menu count = 0 (primary check)
```

The private ledger's entry strings record the actual narrow viewport and selected Local backend. Its automatically populated viewport field retained the launch size, so the entry strings and 320 × 700 screenshot are the viewport evidence.

## Acceptance Criteria

- [ ] At 320 × 700, opening More input actions and pressing Escape removes the overflow menu.
- [ ] Keyboard focus returns to the More input actions trigger after Escape dismissal.
- [ ] Reopening the menu after dismissal still works, and the existing trigger-toggle and outside-click dismissal continue to work.

## Screenshots

Independent fresh Local stack at `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c`, 320 × 700: More input actions remains visible after Escape. The image was inspected before publication; it contains only the tiny genuine conversation fixture and application UI.

![More input actions still open after Escape at 320 × 700](https://raw.githubusercontent.com/enyst/playground/bd663a89e351cd0f88fecb098003f3d839c9c4cd/.pr/bugs/2026-10-07/overflow-escape/after-escape.png)

## Additional Context

Current relevant source: [overflow dismissal and trigger](https://github.com/OpenHands/OpenHands/blob/3f98684763a4e17e6e2faf8dd8f1cfc3969b020c/src/components/features/chat/components/chat-input-actions.tsx) and [shared Escape handler](https://github.com/OpenHands/OpenHands/blob/3f98684763a4e17e6e2faf8dd8f1cfc3969b020c/src/hooks/use-close-on-escape.ts).

A maintainer can decide whether to adopt the shared Escape hook for the overflow menu or provide equivalent scoped keyboard handling. This report reproduces the parent menu with no submenu open; handling nested Model submenus needs an explicit layer/focus decision and validation during the fix. No product-code changes are included in this maintenance run.
