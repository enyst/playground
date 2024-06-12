import importlib
import inspect
import json
from typing import Any

import chromadb
import chromadb.utils.embedding_functions as embedding_functions
from langchain.schema.embeddings import Embeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

from opendevin.core.config import LLMConfig, config
from opendevin.core.logger import opendevin_logger as logger


class LangchainEmbeddingLoader:
    """
    Class to load the embedding functions defined in chroma.
    """

    def __init__(self, *, llm_config: LLMConfig | None = None):
        # just in case, make sure llm_config is set
        llm_config = llm_config or config.llm

        self.type = llm_config.embedding_type
        if not self.type and llm_config.embedding_model in [
            'openai',
            'azureopenai',
            'llama2',
            'ollama',
        ]:
            self.type = llm_config.embedding_model

        # model: text-embedding-ada-002, all-MiniLM-L6-v2, BAAI/bge-small-en-v1.5...
        # note that azure deployment might be set, and that's the model
        self.model = (
            llm_config.embedding_deployment_name
            or llm_config.embedding_model
            or self.get_default_model(self.type)
        )

        # if not set for embeddings, we can use the api_key from llm_config
        self.api_key = llm_config.embedding_api_key or llm_config.api_key

        # base_url: if not set for embeddings, we can use the base_url from llm_config
        self.base_url = llm_config.embedding_base_url or llm_config.base_url

    def _load_embeddings(self, **kwargs: Any) -> Embeddings:
        # get the type and clean it up, we'll send kwargs over
        self.type = kwargs.get('type', self.type)
        kwargs.pop('type', None)

        # figure it out: openai, azureopenai, onnx, or something else
        if self.type == 'openai':
            from langchain_openai.embeddings import OpenAIEmbeddings

            kwargs = kwargs or {}

            # openai api key can be passed as api_key or openai_api_key
            kwargs['openai_api_key'] = kwargs.get(
                'openai_api_key', kwargs.get('api_key', self.api_key)
            )

            return OpenAIEmbeddings(**kwargs)
        elif self.type == 'azureopenai':
            from langchain_openai.embeddings import AzureOpenAIEmbeddings

            kwargs = kwargs or {}

            # openai api key can be passed as api_key or openai_api_key or azure_api_key
            kwargs['azure_openai_api_key'] = kwargs.get(
                'azure_openai_api_key',
                kwargs.get('api_key', kwargs.get('openai_api_key', self.api_key)),
            )

            # openai deployment name can be passed as deployment_name or azure_deployment_name or model
            kwargs['azure_deployment'] = kwargs.get(
                'azure_deployment_name',
                kwargs.get('deployment_name', kwargs.get('model', self.model)),
            )

            # azure_endpoint
            # azure_openai_api_version

            return AzureOpenAIEmbeddings(
                **kwargs,
            )
        elif self.type == 'onnx':
            from langchain_community.embeddings.sagemaker_endpoint import (
                SagemakerEndpointEmbeddings,
            )

            return SagemakerEndpointEmbeddings(**kwargs)
        else:
            try:
                module_path = f'langchain_community.embeddings.{self.type}'
                class_name = (
                    ''.join(word.capitalize() for word in self.type.split('_'))
                    + 'Embeddings'
                )
                module = importlib.import_module(module_path)
                embeddings_class = getattr(module, class_name, None)
                if embeddings_class:
                    return embeddings_class(**kwargs)
            except (ImportError, AttributeError):
                pass

            try:
                module_path, class_name = self.type.rsplit('.', 1)
                module = importlib.import_module(
                    f'langchain_community.embeddings.{module_path}'
                )
                embeddings_class = getattr(module, class_name)
                return embeddings_class(**kwargs)
            except (ImportError, AttributeError):
                pass

            try:
                module_name = self.type.split('.')[-1]
                class_name_mapping = {
                    'aleph_alpha': 'AlephAlphaAsymmetricSemantic',
                    'baidu_qianfan_endpoint': 'QianfanEndpoint',
                    'base': 'Base',
                    'bookend': 'Bookend',
                    'cache': 'CacheBacked',
                    'dashscope': 'DashScope',
                    'databricks': 'Databricks',
                    'deepinfra': 'DeepInfra',
                    'edenai': 'EdenAi',
                    'fastembed': 'Fastembed',
                    'gpt4all': 'GPT4All',
                    'huggingface_hub': 'HuggingFaceHub',
                    'infinity': 'Infinity',
                    'javelin_ai_gateway': 'JavelinAIGateway',
                    'johnsnowlabs': 'Johnsnowlabs',
                    'llamacpp': 'LlamaCpp',
                    'localai': 'LocalAI',
                    'minimax': 'MiniMax',
                    'mlflow': 'MlflowAIGateway',
                    'mlflow_gateway': 'MlflowAIGateway',
                    'modelscope_hub': 'ModelScope',
                    'mosaicml': 'MosaicMLInstructor',
                    'nlpcloud': 'NLPCloud',
                    'octoai': 'OctoAI',
                    'spacy': 'Spacy',
                    'vertexai': 'VertexAI',
                    'voyageai': 'Voyageai',
                }
                class_name = class_name_mapping.get(module_name) or ''
                if class_name:
                    class_name = class_name + 'Embeddings'
                if class_name:
                    module_path = f'langchain_community.embeddings.{module_name}'
                    module = importlib.import_module(module_path)
                    embeddings_class = getattr(module, class_name)
                    return embeddings_class(**kwargs)
            except (ImportError, AttributeError):
                pass

            raise ValueError(f'Unsupported embeddings provider: {self.type}')

    @staticmethod
    def get_default_model(embedding_type):
        # retrieve the default model for the given embedding type
        if embedding_type == 'openai':
            return 'text-embedding-ada-002'
        elif embedding_type == 'huggingface':
            return 'sentence-transformers/all-MiniLM-L6-v2'
        elif embedding_type == 'huggingface_instruct':
            return 'hkunlp/instructor-xl'
        elif embedding_type == 'sentence_transformer':
            return 'paraphrase-MiniLM-L6-v2'
        elif embedding_type == 'ollama':
            return 'all-MiniLM'
        elif embedding_type == 'azureopenai':
            return 'text-embedding-ada-002'
        return 'BAAI/bge-small-en-v1.5'

    @staticmethod
    def _get_embedding_function(
        embedding_type: str | None, **kwargs
    ) -> embedding_functions.EmbeddingFunction:  # type: ignore
        """
        Load and return the embedding function from chroma.
        """
        if embedding_type is None:
            embedding_type = config.llm.embedding_type

        for name, obj in inspect.getmembers(embedding_functions):
            if inspect.isclass(obj) and issubclass(
                obj, embedding_functions.EmbeddingFunction
            ):
                if obj.__name__.lower() == embedding_type.lower():
                    return obj(**kwargs)

        raise ValueError(f'Unsupported embedding type: {embedding_type}')

    @staticmethod
    def print_all_embedding_functions():
        """
        Print all the available embedding functions in chroma.

        Result:
        {
            "AmazonBedrockEmbeddingFunction": [
                "session",
                "model_name",
                "kwargs"
            ],
            "CohereEmbeddingFunction": [
                "api_key",
                "model_name"
            ],
            "EmbeddingFunction": [
                "args",
                "kwargs"
            ],
            "GoogleGenerativeAiEmbeddingFunction": [
                "api_key",
                "model_name",
                "task_type"
            ],
            "GooglePalmEmbeddingFunction": [
                "api_key",
                "model_name"
            ],
            "GoogleVertexEmbeddingFunction": [
                "api_key",
                "model_name",
                "project_id",
                "region"
            ],
            "HuggingFaceEmbeddingFunction": [
                "api_key",
                "model_name"
            ],
            "InstructorEmbeddingFunction": [
                "model_name",
                "device",
                "instruction"
            ],
            "JinaEmbeddingFunction": [
                "api_key",
                "model_name"
            ],
            "OllamaEmbeddingFunction": [
                "url",
                "model_name"
            ],
            "OpenAIEmbeddingFunction": [
                "api_key",
                "model_name",
                "organization_id",
                "api_base",
                "api_type",
                "api_version",
                "deployment_id",
                "default_headers"
            ],
            "OpenCLIPEmbeddingFunction": [
                "model_name",
                "checkpoint",
                "device"
            ],
            "RoboflowEmbeddingFunction": [
                "api_key",
                "api_url"
            ],
            "SentenceTransformerEmbeddingFunction": [
                "model_name",
                "device",
                "normalize_embeddings",
                "kwargs"
            ],
            "Text2VecEmbeddingFunction": [
                "model_name"
            ]
        }
        """
        embedding_kwargs_map = {}

        # The default embedding function in chroma is ONNXMiniLM_L6_V2

        for name, obj in inspect.getmembers(embedding_functions):
            if inspect.isclass(obj) and name.endswith('EmbeddingFunction'):
                # double check for __call__ and its signature
                if callable(obj):
                    call_method = getattr(obj, '__call__')  # noqa B004
                    if callable(call_method):
                        call_signature = inspect.signature(call_method)
                        if len(call_signature.parameters) == 2:
                            first_param = next(iter(call_signature.parameters))
                            second_param = next(iter(call_signature.parameters))
                            logger.info(f'__call__ ({first_param}, {second_param})')

                            print(obj.__name__)
                            init_signature = inspect.signature(obj.__init__)
                            kwargs = [
                                param.name
                                for param in init_signature.parameters.values()
                                if param.name != 'self'
                            ]
                            embedding_kwargs_map[name] = kwargs

        print(json.dumps(embedding_kwargs_map, indent=2))

    @staticmethod
    def get_langchain_chroma_embedding_function(
        **kwargs,
    ) -> embedding_functions.EmbeddingFunction:
        loader = LangchainEmbeddingLoader(llm_config=None)
        langchain_embed_fn = loader._load_embeddings(**kwargs)

        from chromadb.utils.embedding_functions import create_langchain_embedding

        chroma_langchain_embedding = create_langchain_embedding(langchain_embed_fn)

        test_embedding = chroma_langchain_embedding(['Hello, world!', 'How are you?'])
        logger.info(f'Test embedding: {test_embedding[0][0:20]}')

        return chroma_langchain_embedding


class LongTermMemory:
    """
    Handles storing information for the agent to access later.

    Attributes:
    - memories: The collection of memories. Includes agent's own memories, and delegates' memories.
    - action_library: The collection of actions that the agent can learn on the fly if requested.
    """

    memories_store: Chroma
    memories_metadata: dict
    action_library_store: Chroma
    action_library_metadata: dict
    embeddings: embedding_functions.EmbeddingFunction
    chroma_settings: chromadb.Settings

    def __init__(
        self,
        **kwargs,
    ):
        """
        Initializes LongTermMemory and the Chroma store.

        Args:
            **kwargs: Keyword arguments that will be passed to initialize the embeddings,
            such as 'mirostat' for Ollama.
        """

        self.embeddings = (
            LangchainEmbeddingLoader.get_langchain_chroma_embedding_function(**kwargs)
        )

        # chroma client settings
        self.chroma_settings = chromadb.Settings(
            persist_directory='./chroma',
            anonymized_telemetry=False,
        )

        # memories collection
        self.memories_metadata = {
            'type': 'memory',
            'source': 'agent',
        }

        # memories
        self.memories_store = Chroma(
            collection_name='memories',
            collection_metadata=self.memories_metadata,
            embedding_function=self.embeddings,
            client_settings=self.chroma_settings,
        )

        self.event_idx = 0

        # action library collection
        self.action_library_metadata = {
            'type': 'action',
            'source': 'agent',
        }

        # action library
        self.action_library_store = Chroma(
            collection_name='action_library',
            collection_metadata=self.action_library_metadata,
            embedding_function=self.embeddings,
            client_settings=self.chroma_settings,
        )

        self.action_idx = 0

    def _create_embeddings(self, docs: list[dict]) -> list[list[float]]:
        """
        Create embeddings for the given documents using the embedding function.
        """
        logger.info(f'Creating embeddings for {len(docs)} documents')

        # separate the text from the metadata
        texts = [str(doc) for doc in docs]

        # compute embeddings
        embeddings = self.embeddings(input=texts)
        logger.info('{embeddings[0:20]}')

        return embeddings

    def add_events(self, events: list[dict], ids: list[int] | None = None):
        """
        Add multiple documents to the memory in a batch.
        """
        # chroma doesn't like empty lists
        if not events or len(events) == 0:
            return

        logger.info(f'Adding {len(events)} documents to the index in batches')

        documents = []

        # set type and id for each document
        for i, event in enumerate(events):
            metadata = self.action_library_metadata
            if 'action' in event:
                metadata['type'] = 'action'
                metadata['id_action'] = event['action']
            elif 'observation' in event:
                metadata['type'] = 'observation'
                metadata['id_observation'] = event['observation']
            self.event_idx += 1
            metadata['idx'] = self.event_idx
            # metadatas[ids[i]] = metadata

            # create document
            documents.append(
                Document(page_content=json.dumps(event), metadata=metadata)
            )

        # add documents to the index
        ids = self.memories_store.add_documents(documents, batched=True, batch_size=50)
        logger.info('Documents added to the index: %s', len(ids) if ids else 0)

    def add_event(self, event: dict, id: int | None = None):
        """
        Adds a new event to the long term memory with a unique id.

        Parameters:
        - event (dict): The new event to be added to memory
        """
        action_id = ''
        observation_id = ''
        t = ''
        if 'action' in event:
            t = 'action'
            action_id = event['action']
            doc = Document(
                page_content=json.dumps(event),
                id=str(self.event_idx),
                metadata={
                    'type': t,
                    'id': action_id,
                    'idx': self.event_idx,
                },
            )
        elif 'observation' in event:
            t = 'observation'
            observation_id = event['observation']
            doc = Document(
                page_content=json.dumps(event),
                id=str(self.event_idx),
                metadata={
                    'type': t,
                    'id': observation_id,
                    'idx': self.event_idx,
                },
            )

        self.event_idx += 1

        logger.debug('Adding %s event to memory: %d', t, self.event_idx)
        self.memories_store.add_documents([doc])

    def search(self, query: str, k: int = 10):
        """
        Search through the current memory and return the top k results.
        """
        logger.info(f"Searching for '{query}' in the index (top {k} results)")
        # results = self.collection.similarity_search(query, k=k)
        # logger.info(f'Found {len(results)} results')

        # old code
        # retriever = VectorIndexRetriever(
        #    index=self.index,
        #    similarity_top_k=k,
        # )
        # results = retriever.retrieve(query)
        # return [r.get_text() for r in results]
        # end old code

        # example code
        # collection.query(
        #    query_embeddings=[[11.1, 12.1, 13.1],[1.1, 2.3, 3.2], ...],
        #    n_results=10,
        #    where={"metadata_field": "is_equal_to_this"},
        #    where_document={"$contains":"search_string"}
        # )

        # retriever = self.chroma_client.get_retriever(self.collection)
        # results = retriever.retrieve(query, k=k)

        # return [result.metadata for result in results]
        return []


if __name__ == '__main__':
    LangchainEmbeddingLoader.print_all_embedding_functions()
