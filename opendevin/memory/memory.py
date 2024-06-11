import importlib
import inspect
import json
import logging
import pkgutil
import re
from typing import Any

import chromadb
import chromadb.utils.embedding_functions as embedding_functions
import openai
from langchain.docstore.document import Document
from langchain.embeddings import __path__ as embeddings_path
from langchain.schema.embeddings import Embeddings
from langchain_community.vectorstores import Chroma

from opendevin.core.config import LLMConfig, config

logger = logging.getLogger(__name__)


class ChromaEmbeddingLoader:
    """
    Class to load the embedding functions defined in chroma.
    """

    def __init__(self, llm_config: LLMConfig):
        self.type = llm_config.embedding_type or config.llm.embedding_type
        self.model = (
            llm_config.embedding_model
            or config.llm.embedding_model
            or self.get_default_model(self.type)
        )
        self.api_key = llm_config.embedding_api_key or config.llm.api_key
        self.base_url = llm_config.embedding_base_url or config.llm.embedding_base_url
        self.deployment_name = (
            llm_config.embedding_deployment_name or config.llm.embedding_deployment_name
        )

    def load_embedding(self, **kwargs: Any) -> embedding_functions.EmbeddingFunction:
        """
        Load and return the embedding function from chroma.
        """
        self.embedding = self._load_embeddings(
            provider=self.type,
            model=self.model,
            api_key=self.api_key,
            base_url=self.base_url,
            deployment_name=self.deployment_name,
            **kwargs,
        )

    def _load_embeddings(self, **kwargs: Any) -> embedding_functions.EmbeddingFunction:
        if self.type == 'openai':
            from langchain.embeddings.openai import OpenAIEmbeddings

            return OpenAIEmbeddings(api_key=self.api_key, **kwargs)
        elif self.type == 'azureopenai':
            from langchain.embeddings.openai import OpenAIEmbeddings

            return OpenAIEmbeddings(
                deployment=config.llm.embedding_deployment_name,
                model=config.llm.embedding_model,
                api_key=self.api_key,
                **kwargs,
            )
        elif self.type == 'onnx':
            from langchain.embeddings.sagemaker_endpoint import (
                SagemakerEndpointEmbeddings,
            )

            return SagemakerEndpointEmbeddings(**kwargs)
        else:
            try:
                module_path = f'langchain.embeddings.{self.type}'
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
                module = importlib.import_module(f'langchain.embeddings.{module_path}')
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
                    module_path = f'langchain.embeddings.{module_name}'
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
    def get_embedding_function(
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
        embedding_type: str | None, **kwargs
    ) -> embedding_functions.EmbeddingFunction:
        pass

        # from chromadb.utils.embedding_functions import create_langchain_embedding
        # langchain_embedding_fn = OpenAIEmbeddings(**kwargs)
        # chroma_langchain_embedding = create_langchain_embedding(langchain_embedding_fn)

        # embeddings = chroma_langchain_embedding(["Hello, world!", "How are you?"])


class EmbeddingLoader:
    """
    Class to load embedding models based on the provided module name and kwargs.
    """

    @staticmethod
    def get_embedding_model(
        embed_type: str | None, embed_model: str | None, **kwargs
    ) -> Embeddings:
        """
        Load and return an embedding model instance based on the provided module name and params.

        Args:
            embed_type (str | None): Embedding type, e.g. OpenAI, Ollama.
            embed_model (str | None): Embedding model name.
            kwargs: Additional kwargs for the embedding model, e.g. 'mirostat' for Ollama.

        Returns:
            Any: Instance of the embedding model.

        Raises:
            ValueError: If an unsupported module name or parameters are provided.
        """
        if embed_type is None:
            embed_type = config.llm.embedding_type
        if embed_model is None:
            embed_model = config.llm.embedding_model

        embed_type = embed_type.lower()

        for loader, m, is_pkg in pkgutil.walk_packages(embeddings_path):
            if m == embed_type:
                module_path = f'langchain.embeddings.{embed_type}'
                break
        else:
            raise ValueError(f'Unsupported embedding module: {embed_type}')

        module = importlib.import_module(module_path)

        try:
            class_name = EmbeddingLoader._get_class_name(module_path)
            embedding_class = getattr(module, class_name)

            return embedding_class(**kwargs)
        except AttributeError:
            raise ValueError(f'Unsupported embedding model: {embed_model}')

    @staticmethod
    def _get_class_name(module_path: str) -> str:
        """
        Determine the class name based on the module path.

        #FIXME It will work for most cases, but another parameter will be needed for cases with more than one embedding class per module.

        Args:
            module_path (str): The module path for the embedding model.

        Returns:
            str: The class name for the embedding model.
        """
        module_name = module_path.split('.')[-1]
        if 'ai' in module_name.lower() or 'ml' in module_name.lower():
            class_name = ''.join(
                part.capitalize() for part in re.split(r'(?=[A-Z])', module_name)
            )
        elif '_' in module_name:
            parts = module_name.split('_')
            class_name = ''.join(part.capitalize() for part in parts)
        elif 'huggingface' in module_name.lower():
            class_name = 'HuggingFaceEmbeddings'
        else:
            class_name = module_name.capitalize() + 'Embeddings'

        return class_name

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
    def examples():
        # Examples usage
        embed_type = config.llm.embedding_type
        embedding_model = config.llm.embedding_model

        embedding_model = EmbeddingLoader.get_embedding_model(
            embed_type=embed_type, embed_model=embedding_model
        )

        openai_params = {'api_key': config.llm.api_key}
        openai_embeddings = EmbeddingLoader.get_embedding_model(
            'openai', None, **openai_params
        )
        logger.info(openai_embeddings)

        huggingface_params: dict = {}
        huggingface_embeddings = EmbeddingLoader.get_embedding_model(
            'huggingface',
            'sentence-transformers/all-MiniLM-L6-v2',
            **huggingface_params,
        )
        logger.info(huggingface_embeddings)

        instruct_params: dict = {}
        instruct_embeddings = EmbeddingLoader.get_embedding_model(
            'huggingface_instruct', 'hkunlp/instructor-xl', **instruct_params
        )
        logger.info(instruct_embeddings)

        sentence_transformer_params: dict = {}
        sentence_transformer_embeddings = EmbeddingLoader.get_embedding_model(
            'sentence_transformer',
            'paraphrase-MiniLM-L6-v2',
            **sentence_transformer_params,
        )
        logger.info(sentence_transformer_embeddings)


class LongTermMemory:
    """
    Handles storing information for the agent to access later, using Chroma.
    """

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

        embeddings = ChromaEmbeddingLoader.load_embedding(**kwargs)

        self.chroma_client = chromadb.PersistentClient(
            path='./chroma', settings=chromadb.Settings(anonymized_telemetry=False)
        )

        self.collection = self.chroma_client.get_or_create_collection(
            name='memories',
            metadata={'type': 'memory'},
            # embedding_function=embeddings
        )

        langchain_vector_store = Chroma(
            self.chroma_client, self.collection, embedding_function=embeddings
        )
        self.index = langchain_vector_store.index

        # self.index = self.chroma_db.index
        self.thought_idx = 0

    def _create_embeddings(self, docs: list[dict]) -> list[list[float]]:
        """
        Create embeddings for the given documents using OpenAI.
        """
        logger.info(f'Creating embeddings for {len(docs)} documents')
        texts = [str(doc) for doc in docs]
        embeddings = openai.Embedding.create(input=texts)['data']
        logger.info('Embeddings created successfully')
        return [embedding['embedding'] for embedding in embeddings]

    def add_doc(self, doc: dict):
        """
        Add a single document to the memory.
        """
        logger.info('Adding a single document to the index')
        embedding = self._create_embeddings([doc])[0]
        self.collection.add_texts(
            [Document(page_content=str(doc), metadata=doc, embedding=embedding)]
        )
        logger.info('Document added to the index')

    def add_docs(self, docs: list[dict]):
        """
        Add multiple documents to the memory in a batch.
        """
        logger.info(f'Adding {len(docs)} documents to the index in batches')

        initial_docs = [
            {
                'Action': 'FileReadAction',
                'args': [{'content': 'some content', 'path': '/workspace/song.txt'}],
            }
        ]
        embeddings = self._create_embeddings(initial_docs)
        documents = [
            Document(page_content=str(doc), metadata=doc, embedding=embedding)
            for doc, embedding in zip(docs, embeddings)
        ]
        self.collection.add_texts(documents, batched=True, batch_size=50)
        logger.info('Documents added to the index')

        # collection.add(
        #    documents=["doc1", "doc2", "doc3", ...],
        #    embeddings=[[1.1, 2.3, 3.2], [4.5, 6.9, 4.4], [1.1, 2.3, 3.2], ...],
        #    metadatas=[{"chapter": "3", "verse": "16"}, {"chapter": "3", "verse": "5"}, {"chapter": "29", "verse": "11"}, ...],
        #    ids=["id1", "id2", "id3", ...]
        # )

    def add_event(self, event: dict):
        """
        Adds a new event to the long term memory with a unique id.

        Parameters:
        - event (dict): The new event to be added to memory
        """
        id = ''
        t = ''
        if 'action' in event:
            t = 'action'
            id = event['action']
        elif 'observation' in event:
            t = 'observation'
            id = event['observation']
        doc = Document(
            text=json.dumps(event),
            doc_id=str(self.thought_idx),
            extra_info={
                'type': t,
                'id': id,
                'idx': self.thought_idx,
            },
        )
        self.thought_idx += 1
        logger.debug('Adding %s event to memory: %d', t, self.thought_idx)
        self.add_doc(doc)

    def search(self, query: str, k: int = 10):
        """
        Search through the current memory and return the top k results.
        """
        logger.info(f"Searching for '{query}' in the index (top {k} results)")
        results = self.collection.similarity_search(query, k=k)
        logger.info(f'Found {len(results)} results')

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

        retriever = self.chroma_client.get_retriever(self.collection)
        results = retriever.retrieve(query, k=k)

        return [result.metadata for result in results]


if __name__ == '__main__':
    ChromaEmbeddingLoader.print_all_embedding_functions()
