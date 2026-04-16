from __future__ import annotations

import importlib.util
import itertools
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_COUNTER = itertools.count()


def load_module(script_name: str):
    path = ROOT / 'scripts' / script_name
    module_name = f'test_{path.stem}_{next(MODULE_COUNTER)}'
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f'Unable to load module from {path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_list_open_issues_filters_by_duplicate_candidate_label(monkeypatch):
    module = load_module('auto_close_duplicate_issues.py')
    requested_paths: list[str] = []

    def fake_request_json(path: str, *, method: str = 'GET', body=None):
        requested_paths.append(path)
        return []

    monkeypatch.setattr(module, 'request_json', fake_request_json)

    assert module.list_open_issues('enyst/playground') == []
    assert requested_paths == [
        '/repos/enyst/playground/issues?state=open&labels=duplicate-candidate&per_page=100&page=1'
    ]


def test_has_reaction_from_user_ignores_missing_user_ids():
    module = load_module('auto_close_duplicate_issues.py')
    reactions = [
        {'user': None, 'content': '-1'},
        {'user': {'id': 42}, 'content': '-1'},
    ]

    assert module.user_id_from_item({'user': None}) is None
    assert module.has_reaction_from_user(reactions, None, '-1') is False
    assert module.has_reaction_from_user(reactions, 42, '-1') is True
    assert module.has_reaction_from_user(reactions, 42, '+1') is False


def test_parse_agent_json_handles_single_line_fenced_json():
    module = load_module('issue_duplicate_check_openhands.py')

    assert module.parse_agent_json('```json{"key":"value"}```') == {'key': 'value'}


def test_poll_start_task_retries_after_empty_payload(monkeypatch):
    module = load_module('issue_duplicate_check_openhands.py')
    responses = [
        [],
        {'items': [{'status': 'READY', 'app_conversation_id': 'conv-123'}]},
    ]

    monkeypatch.setattr(
        module, 'request_json', lambda *args, **kwargs: responses.pop(0)
    )
    monkeypatch.setattr(
        module, 'openhands_headers', lambda: {'Authorization': 'Bearer test-token'}
    )
    monkeypatch.setattr(module.time, 'time', lambda: 0)
    monkeypatch.setattr(module.time, 'sleep', lambda _seconds: None)

    item = module.poll_start_task(
        'task-123', poll_interval_seconds=1, max_wait_seconds=10
    )

    assert item['app_conversation_id'] == 'conv-123'


def test_poll_conversation_retries_after_empty_items(monkeypatch):
    module = load_module('issue_duplicate_check_openhands.py')
    responses = [
        {'items': []},
        {
            'items': [
                {
                    'execution_status': 'completed',
                    'conversation_url': 'https://example.test',
                }
            ]
        },
    ]

    monkeypatch.setattr(
        module, 'request_json', lambda *args, **kwargs: responses.pop(0)
    )
    monkeypatch.setattr(
        module, 'openhands_headers', lambda: {'Authorization': 'Bearer test-token'}
    )
    monkeypatch.setattr(module.time, 'time', lambda: 0)
    monkeypatch.setattr(module.time, 'sleep', lambda _seconds: None)

    item = module.poll_conversation(
        'conv-123', poll_interval_seconds=1, max_wait_seconds=10
    )

    assert item['execution_status'] == 'completed'
