from openhands.core.schema.observation import ObservationType
from openhands.events.action.files import FileEditSource
from openhands.events.observation import (
    CmdOutputMetadata,
    CmdOutputObservation,
    FileEditObservation,
    Observation,
    RecallObservation,
    RecallType,
)
from openhands.events.serialization import (
    event_from_dict,
    event_to_dict,
    event_to_memory,
    event_to_trajectory,
)
from openhands.events.serialization.observation import observation_from_dict


def serialization_deserialization(
    original_observation_dict, cls, max_message_chars: int = 10000
):
    observation_instance = event_from_dict(original_observation_dict)
    assert isinstance(
        observation_instance, Observation
    ), 'The observation instance should be an instance of Action.'
    assert isinstance(
        observation_instance, cls
    ), 'The observation instance should be an instance of CmdOutputObservation.'
    serialized_observation_dict = event_to_dict(observation_instance)
    serialized_observation_trajectory = event_to_trajectory(observation_instance)
    serialized_observation_memory = event_to_memory(
        observation_instance, max_message_chars
    )
    assert (
        serialized_observation_dict == original_observation_dict
    ), 'The serialized observation should match the original observation dict.'
    assert (
        serialized_observation_trajectory == original_observation_dict
    ), 'The serialized observation trajectory should match the original observation dict.'
    original_observation_dict.pop('message', None)
    original_observation_dict.pop('id', None)
    original_observation_dict.pop('timestamp', None)
    assert (
        serialized_observation_memory == original_observation_dict
    ), 'The serialized observation memory should match the original observation dict.'


# Additional tests for various observation subclasses can be included here
def test_observation_event_props_serialization_deserialization():
    original_observation_dict = {
        'observation': 'cmd_output',
        'content': 'test content',
        'extras': {
            'exit_code': 0,
            'success': True,
            'metadata': {
                'command': 'ls -la',
                'is_input': False,
            },
        },
    }
    serialization_deserialization(original_observation_dict, CmdOutputObservation)


def test_command_output_observation_serialization_deserialization():
    original_observation_dict = {
        'observation': 'cmd_output',
        'content': 'test content',
        'extras': {
            'exit_code': 0,
            'success': True,
            'metadata': {
                'command': 'ls -la',
                'is_input': False,
            },
        },
    }
    serialization_deserialization(original_observation_dict, CmdOutputObservation)


def test_success_field_serialization():
    original_observation_dict = {
        'observation': 'cmd_output',
        'content': 'test content',
        'extras': {
            'exit_code': 0,
            'success': True,
            'metadata': {
                'command': 'ls -la',
                'is_input': False,
            },
        },
    }
    observation_instance = event_from_dict(original_observation_dict)
    assert isinstance(observation_instance, CmdOutputObservation)
    assert observation_instance.success is True


def test_legacy_serialization():
    original_observation_dict = {
        'observation': 'cmd_output',
        'content': 'test content',
        'exit_code': 0,
        'success': True,
        'metadata': {
            'command': 'ls -la',
            'is_input': False,
        },
    }
    observation_instance = observation_from_dict(original_observation_dict)
    assert isinstance(observation_instance, CmdOutputObservation)
    assert observation_instance.exit_code == 0
    assert observation_instance.success is True
    assert observation_instance.metadata.command == 'ls -la'
    assert observation_instance.metadata.is_input is False


def test_file_edit_observation_serialization():
    original_observation_dict = {
        'observation': 'file_edit',
        'content': 'test content',
        'extras': {
            'path': '/path/to/file',
            'old_content': 'old content',
            'new_content': 'new content',
            'source': FileEditSource.AGENT,
        },
    }
    serialization_deserialization(original_observation_dict, FileEditObservation)


def test_file_edit_observation_new_file_serialization():
    original_observation_dict = {
        'observation': 'file_edit',
        'content': 'test content',
        'extras': {
            'path': '/path/to/file',
            'old_content': '',
            'new_content': 'new content',
            'source': FileEditSource.AGENT,
        },
    }
    serialization_deserialization(original_observation_dict, FileEditObservation)


def test_file_edit_observation_oh_aci_serialization():
    original_observation_dict = {
        'observation': 'file_edit',
        'content': 'test content',
        'extras': {
            'path': '/path/to/file',
            'old_content': 'old content',
            'new_content': 'new content',
            'source': 'agent',
        },
    }
    observation_instance = event_from_dict(original_observation_dict)
    assert isinstance(observation_instance, FileEditObservation)
    assert observation_instance.path == '/path/to/file'
    assert observation_instance.old_content == 'old content'
    assert observation_instance.new_content == 'new content'
    assert observation_instance.source == FileEditSource.AGENT


def test_file_edit_observation_legacy_serialization():
    original_observation_dict = {
        'observation': 'file_edit',
        'content': 'test content',
        'path': '/path/to/file',
        'old_content': 'old content',
        'new_content': 'new content',
        'source': 'agent',
    }
    observation_instance = observation_from_dict(original_observation_dict)
    assert isinstance(observation_instance, FileEditObservation)
    assert observation_instance.path == '/path/to/file'
    assert observation_instance.old_content == 'old content'
    assert observation_instance.new_content == 'new content'
    assert observation_instance.source == FileEditSource.AGENT

    # Check that the serialized event has the correct structure
    event_dict = event_to_dict(observation_instance)
    assert event_dict['observation'] == 'file_edit'
    assert event_dict['content'] == 'test content'
    assert event_dict['extras']['path'] == '/path/to/file'
    assert event_dict['extras']['old_content'] == 'old content'
    assert event_dict['extras']['new_content'] == 'new content'
    assert 'formatted_output_and_error' not in event_dict['extras']


def test_recall_observation_serialization():
    original_observation_dict = {
        'observation': 'recall',
        'extras': {
            'recall_type': RecallType.ENVIRONMENT_INFO,
            'repo_name': 'some_repo_name',
            'repo_directory': 'some_repo_directory',
            'runtime_hosts': ['host1', 'host2'],
            'repo_instructions': 'complex_repo_instructions',
            'microagent_knowledge': [],  # Default empty list
        },
    }
    
    # Create a modified version for comparison after serialization
    expected_dict = original_observation_dict.copy()
    expected_dict['extras'] = expected_dict['extras'].copy()
    expected_dict['extras']['recall_type'] = RecallType.ENVIRONMENT_INFO.value
    expected_dict['content'] = ''
    
    # Get the observation instance
    observation_instance = event_from_dict(original_observation_dict)
    assert isinstance(observation_instance, RecallObservation)
    
    # Serialize and check
    serialized = event_to_dict(observation_instance)
    assert serialized['observation'] == ObservationType.RECALL
    assert serialized['extras']['recall_type'] == RecallType.ENVIRONMENT_INFO.value
    assert serialized['extras']['repo_name'] == 'some_repo_name'
    assert serialized['extras']['repo_directory'] == 'some_repo_directory'
    assert serialized['extras']['runtime_hosts'] == ['host1', 'host2']


def test_recall_observation_microagent_knowledge_serialization():
    original_observation_dict = {
        'observation': 'recall',
        'extras': {
            'recall_type': RecallType.KNOWLEDGE_MICROAGENT,
            'microagent_knowledge': [
                {
                    'agent_name': 'microagent1',
                    'trigger_word': 'trigger_word1',
                    'content': 'content1',
                },
                {
                    'agent_name': 'microagent2',
                    'trigger_word': 'trigger_word2',
                    'content': 'content2',
                },
            ],
            'repo_name': '',  # Default empty string
            'repo_directory': '',  # Default empty string
            'repo_instructions': '',  # Default empty string
            'runtime_hosts': {},  # Default empty dict
        },
    }
    
    # Get the observation instance
    observation_instance = event_from_dict(original_observation_dict)
    assert isinstance(observation_instance, RecallObservation)
    
    # Serialize and check
    serialized = event_to_dict(observation_instance)
    assert serialized['observation'] == ObservationType.RECALL
    assert serialized['extras']['recall_type'] == RecallType.KNOWLEDGE_MICROAGENT.value
    assert len(serialized['extras']['microagent_knowledge']) == 2
    assert serialized['extras']['microagent_knowledge'][0]['agent_name'] == 'microagent1'


def test_recall_observation_knowledge_microagent_serialization():
    """Test serialization of a RecallObservation with KNOWLEDGE_MICROAGENT type."""
    # Create a RecallObservation with microagent knowledge content
    original = RecallObservation(
        content='Knowledge microagent information',
        recall_type=RecallType.KNOWLEDGE_MICROAGENT,
        microagent_knowledge=[
            {
                'agent_name': 'python_best_practices',
                'trigger_word': 'python',
                'content': 'Always use virtual environments for Python projects.',
            },
            {
                'agent_name': 'git_workflow',
                'trigger_word': 'git',
                'content': 'Create a new branch for each feature or bugfix.',
            },
        ],
    )

    # Serialize to dictionary
    serialized = event_to_dict(original)

    # Verify serialized data structure
    assert serialized['observation'] == ObservationType.RECALL
    assert serialized['content'] == 'Knowledge microagent information'
    assert serialized['extras']['recall_type'] == RecallType.KNOWLEDGE_MICROAGENT.value
    assert len(serialized['extras']['microagent_knowledge']) == 2
    assert serialized['extras']['microagent_knowledge'][0]['trigger_word'] == 'python'

    # Deserialize back to RecallObservation
    deserialized = observation_from_dict(serialized)

    # Verify properties are preserved
    assert deserialized.recall_type == RecallType.KNOWLEDGE_MICROAGENT
    assert deserialized.microagent_knowledge == original.microagent_knowledge
    assert deserialized.content == original.content

    # Check that environment info fields are empty defaults
    assert deserialized.repo_name == ''
    assert deserialized.repo_directory == ''
    assert deserialized.repo_instructions == ''
    assert deserialized.runtime_hosts == {}


def test_recall_observation_environment_info_serialization():
    """Test serialization of a RecallObservation with ENVIRONMENT_INFO type."""
    # Create a RecallObservation with environment info
    original = RecallObservation(
        content='Environment information',
        recall_type=RecallType.ENVIRONMENT_INFO,
        repo_name='OpenHands',
        repo_directory='/workspace/openhands',
        repo_instructions="Follow the project's coding style guide.",
        runtime_hosts={'127.0.0.1': 8080, 'localhost': 5000},
    )

    # Serialize to dictionary
    serialized = event_to_dict(original)

    # Verify serialized data structure
    assert serialized['observation'] == ObservationType.RECALL
    assert serialized['content'] == 'Environment information'
    assert serialized['extras']['recall_type'] == RecallType.ENVIRONMENT_INFO.value
    assert serialized['extras']['repo_name'] == 'OpenHands'
    assert serialized['extras']['repo_directory'] == '/workspace/openhands'
    assert serialized['extras']['repo_instructions'] == "Follow the project's coding style guide."
    assert serialized['extras']['runtime_hosts'] == {
        '127.0.0.1': 8080,
        'localhost': 5000,
    }

    # Deserialize back to RecallObservation
    deserialized = observation_from_dict(serialized)

    # Verify properties are preserved
    assert deserialized.recall_type == RecallType.ENVIRONMENT_INFO
    assert deserialized.repo_name == original.repo_name
    assert deserialized.repo_directory == original.repo_directory
    assert deserialized.repo_instructions == original.repo_instructions
    assert deserialized.runtime_hosts == original.runtime_hosts

    # Check that knowledge microagent fields are empty
    assert deserialized.microagent_knowledge == []


def test_recall_observation_combined_serialization():
    """Test serialization of a RecallObservation with both types of information."""
    # Create a RecallObservation with both environment and microagent info
    # Note: In practice, recall_type would still be one specific type,
    # but the object could contain both types of fields
    original = RecallObservation(
        content='Combined information',
        recall_type=RecallType.ENVIRONMENT_INFO,
        # Environment info
        repo_name='OpenHands',
        repo_directory='/workspace/openhands',
        repo_instructions="Follow the project's coding style guide.",
        runtime_hosts={'127.0.0.1': 8080},
        # Knowledge microagent info
        microagent_knowledge=[
            {
                'agent_name': 'python_best_practices',
                'trigger_word': 'python',
                'content': 'Always use virtual environments for Python projects.',
            }
        ],
    )

    # Serialize to dictionary
    serialized = event_to_dict(original)

    # Verify serialized data has both types of fields
    assert serialized['extras']['recall_type'] == RecallType.ENVIRONMENT_INFO.value
    assert serialized['extras']['repo_name'] == 'OpenHands'
    assert (
        serialized['extras']['microagent_knowledge'][0]['agent_name']
        == 'python_best_practices'
    )

    # Deserialize back to RecallObservation
    deserialized = observation_from_dict(serialized)

    # Verify all properties are preserved
    assert deserialized.recall_type == RecallType.ENVIRONMENT_INFO

    # Environment properties
    assert deserialized.repo_name == original.repo_name
    assert deserialized.repo_directory == original.repo_directory
    assert deserialized.repo_instructions == original.repo_instructions
    assert deserialized.runtime_hosts == original.runtime_hosts

    # Knowledge microagent properties
    assert deserialized.microagent_knowledge == original.microagent_knowledge