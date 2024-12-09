import json

import anthropic

from openhands.core.message import Message


# These functions are written to be used as methods of the LLM class
# for testing the Anthropic token counter
# litellm doesn't support it, so we need to use the Anthropic API directly
def test_anthropic_token_counter(self) -> int:
    """Test Anthropic token counter with a simple example."""
    print('\nTesting with simple messages first:')
    client = anthropic.Anthropic(api_key=self.config.api_key)
    test_messages = [
        {'role': 'user', 'content': 'Hello'},
        {'role': 'assistant', 'content': 'Hi there!'},
    ]

    print(json.dumps(test_messages, indent=2))

    # Try these messages
    model = self.config.model.removeprefix('litellm_proxy/').removeprefix('anthropic/')
    test_response = client.beta.messages.count_tokens(
        model=model,
        messages=test_messages,
    )
    print(f'Test successful! Token count: {test_response.input_tokens}')
    return test_response.input_tokens


def llm_anthropic_token_counter(self, messages: list[dict]) -> int:
    """Anthropic token counter."""

    def _convert_to_dicts(messages: list[Message]) -> list[dict]:
        # convert Message objects to dicts, litellm expects dicts
        if (
            isinstance(messages, list)
            and len(messages) > 0
            and isinstance(messages[0], Message)
        ):
            messages = self.format_messages_for_llm(messages)
        return messages

    messages = _convert_to_dicts(messages)

    # For Anthropic models, use their token counting endpoint
    client = anthropic.Anthropic(api_key=self.config.api_key)
    if self.config.model and 'claude' in self.config.model:
        try:
            anthropic_system_message = None
            # Convert messages to Anthropic format (only user/assistant roles)
            anthropic_messages = []
            for msg in messages:
                # Skip system messages as they're handled differently in Anthropic
                if msg['role'] == 'system':
                    anthropic_system_message = (msg.get('content', ''),)
                    continue
                # Convert tool messages to assistant messages
                if msg['role'] == 'tool':
                    anthropic_messages.append(
                        {
                            'role': 'user',
                            'content': msg.get('content', ''),
                        }
                    )
                else:
                    # Keep user/assistant messages as is
                    anthropic_messages.append(
                        {
                            'role': msg['role'],
                            'content': msg.get('content', ''),
                        }
                    )

            # use the model name without litellm_proxy/ and anthropic/ prefixes
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
