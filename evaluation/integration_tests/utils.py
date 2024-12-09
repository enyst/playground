import json

import anthropic


def llm_anthropic_token_counter(self, messages: list[dict]) -> int:
    """Anthropic token counter."""
    # For Anthropic models, use their token counting endpoint
    client = anthropic.Anthropic(api_key=self.config.api_key)
    if self.config.model and 'claude' in self.config.model:
        try:
            # Test with a simple example first
            test_messages = [
                {'role': 'user', 'content': 'Hello'},
                {'role': 'assistant', 'content': 'Hi there!'},
            ]

            print('\nTesting with simple messages first:')
            print(json.dumps(test_messages, indent=2))

            # Try the simple test first
            model = self.config.model.removeprefix('litellm_proxy/').removeprefix(
                'anthropic/'
            )
            test_response = client.beta.messages.count_tokens(
                model=model,
                messages=test_messages,
            )
            print(f'Test successful! Token count: {test_response.input_tokens}')

            anthropic_system_message = None
            # Convert messages to Anthropic format (only user/assistant roles)
            anthropic_messages = []
            for msg in messages:
                # Skip system messages as they're handled differently in Anthropic
                if msg['role'] == 'system':
                    anthropic_system_message = (
                        msg.get('content', '')[0]['text'][:20] + '...'
                    )
                    continue
                # Convert tool messages to assistant messages
                if msg['role'] == 'tool':
                    anthropic_messages.append(
                        {
                            'role': 'user',
                            'content': msg.get('content', '')[0]['text'][:50] + '...',
                        }
                    )
                else:
                    # Keep user/assistant messages as is
                    anthropic_messages.append(
                        {
                            'role': msg['role'],
                            'content': msg.get('content', '')[0]['text'][:50] + '...',
                        }
                    )

            # Debug print
            print('\nAnthropicMessages:')
            print(json.dumps(anthropic_messages, indent=2))
            print('\nSystem Message:')
            print(anthropic_system_message if anthropic_system_message else 'None')

            # use the model name without litellm_proxy/ prefix
            model = self.config.model.removeprefix('litellm_proxy/').removeprefix(
                'anthropic/'
            )
            response = client.beta.messages.count_tokens(
                # betas=['token-counting-2024-11-01'],
                model=model,
                messages=anthropic_messages,
            )
            return response.input_tokens
        except Exception as e:
            print(f'Failed to use Anthropic token counter: {e}')
            raise
    return 0
