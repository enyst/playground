#!/usr/bin/env python3
"""Simple test script to verify the API client structure."""

import os
from unittest.mock import patch

from cloud_api import OpenHandsCloudAPI


def test_api_client_initialization():
    """Test API client initialization."""
    print('Testing API client initialization...')

    # Test with explicit API key
    client = OpenHandsCloudAPI(api_key='test-key')
    assert client.api_key == 'test-key'
    assert client.base_url == 'https://app.all-hands.dev'
    print('✅ Explicit API key initialization works')

    # Test with environment variable
    with patch.dict(os.environ, {'OPENHANDS_API_KEY': 'env-key'}):
        client = OpenHandsCloudAPI()
        assert client.api_key == 'env-key'
        print('✅ Environment variable initialization works')

    # Test missing API key
    with patch.dict(os.environ, {}, clear=True):
        try:
            OpenHandsCloudAPI()
            raise AssertionError('Should have raised ValueError')
        except ValueError as e:
            assert 'API key is required' in str(e)
            print('✅ Missing API key validation works')


def test_api_methods_structure():
    """Test that API methods have correct structure."""
    print('\nTesting API method structures...')

    client = OpenHandsCloudAPI(api_key='test-key')

    # Check that methods exist
    assert hasattr(client, 'store_llm_settings')
    assert hasattr(client, 'create_conversation')
    assert hasattr(client, 'get_conversation')
    assert hasattr(client, 'get_trajectory')
    assert hasattr(client, 'poll_until_stopped')
    assert hasattr(client, 'post_github_comment')
    print('✅ All expected methods exist')

    # Check method signatures (basic check)
    import inspect

    sig = inspect.signature(client.store_llm_settings)
    assert 'llm_model' in sig.parameters
    print('✅ store_llm_settings has correct signature')

    sig = inspect.signature(client.create_conversation)
    assert 'initial_user_msg' in sig.parameters
    print('✅ create_conversation has correct signature')


def test_template_loading():
    """Test template loading functionality."""
    print('\nTesting template loading...')

    from pathlib import Path

    from jinja2 import Environment, FileSystemLoader

    script_dir = Path(__file__).parent
    prompts_dir = script_dir / 'prompts'

    assert prompts_dir.exists(), 'Prompts directory should exist'
    assert (prompts_dir / 'new_conversation.j2').exists(), 'Template file should exist'

    env = Environment(loader=FileSystemLoader(prompts_dir))
    template = env.get_template('new_conversation.j2')
    content = template.render()

    assert len(content.strip()) > 0, 'Template should have content'
    assert len(content.split()) > 5, 'Template should have meaningful content'
    print('✅ Template loading and rendering works')


if __name__ == '__main__':
    print('Running API client tests...\n')

    test_api_client_initialization()
    test_api_methods_structure()
    test_template_loading()

    print('\n🎉 All tests passed!')
