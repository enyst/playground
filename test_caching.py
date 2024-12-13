import os
from openhands.agenthub.codeact_agent.codeact_agent import CodeActAgent
from openhands.core.config import AgentConfig, LLMConfig
from openhands.llm.llm import LLM
from openhands.controller.state.state import State
from openhands.events.action import MessageAction

# Initialize LLM with caching enabled
llm = LLM(LLMConfig(
    model='claude-3-5-sonnet-20241022',
    api_key=os.environ['ANTHROPIC_API_KEY'],
    caching_prompt=True,
))

# Initialize agent
agent = CodeActAgent(llm, AgentConfig())

# Initialize state
state = State(max_iterations=10)
state.history = []

def send_message(msg: str):
    # Create and add user message
    action = MessageAction(msg)
    action._source = "user"
    state.history.append(action)
    
    # Get agent's response
    response = agent.step(state)
    if isinstance(response, MessageAction):
        state.history.append(response)
        print(f"\nUser: {msg}")
        print(f"Assistant: {response.content}")
        if hasattr(response, "tool_call_metadata") and response.tool_call_metadata:
            usage = response.tool_call_metadata.model_response.usage
            print("\nToken Usage:")
            print(f"Input tokens: {usage.input_tokens}")
            print(f"Output tokens: {usage.output_tokens}")
            if hasattr(usage, "cache_read_input_tokens"):
                print(f"Cache read tokens: {usage.cache_read_input_tokens}")
            if hasattr(usage, "cache_creation_input_tokens"):
                print(f"Cache write tokens: {usage.cache_creation_input_tokens}")
        print("-" * 80)
    return response

# Test conversation
messages = [
    "Hello! Can you help me understand how prompt caching works?",
    "What's your role as an AI assistant?",
    "Can you explain what you do?",
    "One more time, what are you?",
    "And finally, who are you?"
]

for msg in messages:
    send_message(msg)