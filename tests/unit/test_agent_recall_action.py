import pytest
from openhands.events.action.agent import AgentRecallAction
from openhands.core.schema import ActionType
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
