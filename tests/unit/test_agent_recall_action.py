import pytest
from openhands.events.action.agent import AgentRecallAction
from openhands.core.schema import ActionType
from openhands.events.serialization import (
    event_from_dict,
    event_to_dict,
    event_to_memory,
)
from openhands.events.action import Action


def test_agent_recall_action_creation():
    """Test creating an AgentRecallAction with various parameters."""
    # Test with default parameters
    action = AgentRecallAction()
    assert action.query == ""
    assert action.thought == ""
    assert action.action == ActionType.RECALL
    
    # Test with custom parameters
    query = "What is the capital of France?"
    thought = "I need to recall information about France"
    action = AgentRecallAction(query=query, thought=thought)
    assert action.query == query
    assert action.thought == thought
    assert action.action == ActionType.RECALL
    
    # Test message property
    assert action.message == f"Retrieving data for: {query[:50]}"
    
    # Test string representation
    assert "**AgentRecallAction**" in str(action)
    assert f"QUERY: {query[:50]}" in str(action)


def test_agent_recall_action_serialization_deserialization():
    """Test serialization and deserialization of AgentRecallAction."""
    original_action_dict = {
        "action": "recall",
        "args": {
            "query": "What is the capital of France?",
            "thought": "I need to recall information about France",
        },
    }
    
    # Deserialize from dict to action
    action = event_from_dict(original_action_dict)
    assert isinstance(action, AgentRecallAction)
    assert action.query == "What is the capital of France?"
    assert action.thought == "I need to recall information about France"
    
    # Serialize back to dict
    serialized_action_dict = event_to_dict(action)
    # Remove message which is added during serialization
    serialized_action_dict.pop("message")
    assert serialized_action_dict == original_action_dict
    
    # Test memory serialization
    memory_dict = event_to_memory(action, max_message_chars=10000)
    assert memory_dict["action"] == "recall"
    assert memory_dict["args"]["query"] == "What is the capital of France?"
    assert memory_dict["args"]["thought"] == "I need to recall information about France"


def test_agent_recall_action_inheritance():
    """Test that AgentRecallAction inherits from Action."""
    action = AgentRecallAction(query="test query")
    assert isinstance(action, Action)
    assert action.action == ActionType.RECALL


def test_agent_recall_action_with_long_query():
    """Test AgentRecallAction with a long query."""
    long_query = "A" * 100
    action = AgentRecallAction(query=long_query)
    
    # Message should truncate to 50 chars
    assert action.message == f"Retrieving data for: {long_query[:50]}"
    
    # String representation should also truncate
    assert str(action) == f"**AgentRecallAction**\nQUERY: {long_query[:50]}"