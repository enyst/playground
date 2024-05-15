import importlib
import json
import logging
import pkgutil
import re
from typing import Any

import chromadb
import openai
from langchain.docstore.document import Document
from langchain.embeddings import __path__ as embeddings_path
from langchain.schema.embeddings import Embeddings
from langchain.vectorstores import Chroma

from opendevin.core.config import config

logger = logging.getLogger(__name__)


class EmbeddingLoader:
    """
    Class to load embedding models based on the provided module name and kwargs.
    """

    @staticmethod
    def get_embedding_model(
        module_name: str, params: dict[str, Any] | None = None
    ) -> Embeddings:
        """
        Load and return an embedding model instance based on the provided module name and params.

        Args:
            module_name (str): Name of the module containing the embedding model to load.
            params [dict[str, Any]] | None: Additional parameters required for the embedding model.

        Returns:
            Any: Instance of the embedding model.

        Raises:
            ValueError: If an unsupported module name or parameters are provided.
        """
        params = params or {}
        module_name = module_name.lower()

        for loader, m, is_pkg in pkgutil.walk_packages(embeddings_path):
            if m == module_name:
                module_path = f'langchain.embeddings.{module_name}'
                break
        else:
            raise ValueError(f'Unsupported embedding module: {module_name}')

        module = importlib.import_module(module_path)

        class_name = EmbeddingLoader._get_class_name(module_path)
        embedding_class = getattr(module, class_name)

        return embedding_class(**params)

    @staticmethod
    def _get_class_name(module_path: str) -> str:
        """
        Determine the class name based on the module path.

        #FIXME It will work for most cases, but another config parameter will be needed for cases with more than one embedding class per module.

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
        else:
            class_name = module_name.capitalize() + 'Embeddings'

        return class_name

    @staticmethod
    def get_default_model(embedding_type):
        # retrieve the default model for the given embedding type
        return 'BAAI/bge-small-en-v1.5'

    @staticmethod
    def examples():
        # Examples usage
        embedding_type = config.llm.embedding_type
        embedding_params = {
            'model_name': config.llm.embedding_model
            if config.llm.embedding_model
            else EmbeddingLoader.get_default_model(embedding_type)
        }
        embedding_model = EmbeddingLoader.get_embedding_model(
            embedding_type, embedding_params
        )

        openai_params = {'openai_api_key': 'your_openai_api_key'}
        openai_embeddings = EmbeddingLoader.get_embedding_model('openai', openai_params)

        huggingface_params = {'model_name': 'sentence-transformers/all-MiniLM-L6-v2'}
        huggingface_embeddings = EmbeddingLoader.get_embedding_model(
            'huggingface', huggingface_params
        )

        instruct_params = {'model_name': 'hkunlp/instructor-xl'}
        instruct_embeddings = EmbeddingLoader.get_embedding_model(
            'huggingface_instruct', instruct_params
        )

        sentence_transformer_params = {'model_name': 'paraphrase-MiniLM-L6-v2'}
        sentence_transformer_embeddings = EmbeddingLoader.get_embedding_model(
            'sentence_transformer', sentence_transformer_params
        )


# WIP, so disabled for now: do nothing in the global space


class LongTermMemory:
    """
    Handles storing information for the agent to access later, using Chroma.
    """

    def __init__(self, embedding_model):
        """
        Initialize Chroma with the provided embedding model.
        """
        self.chroma_db = Chroma(
            collection_name='memories',
            persist_directory='chroma',
            embedding_function=embedding_model,
            client_settings=chromadb.config.Settings(telemetry_enabled=False),
        )

    def add_docs(self, docs: list[dict]):
        """
        Add multiple documents to the memory in a batch.
        """
        embeddings = self._create_embeddings(docs)
        docs = [
            Document(page_content=str(doc), metadata=doc, embedding=embedding)
            for doc, embedding in zip(docs, embeddings)
        ]
        self.chroma_db.add_texts(docs, batched=True, batch_size=50)

    def _create_embeddings(self, docs: list[dict]) -> list[list[float]]:
        """
        Create embeddings for the given documents using OpenAI.
        """
        logger.info(f'Creating embeddings for {len(docs)} documents')
        openai.api_key = config.llm.api_key
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
        self.chroma_db.add_texts(
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
        embeddings = self._create_embeddings(docs)
        documents = [
            Document(page_content=str(doc), metadata=doc, embedding=embedding)
            for doc, embedding in zip(docs, embeddings)
        ]
        self.chroma_db.add_texts(documents, batched=True, batch_size=50)
        logger.info('Documents added to the index')

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
        self._add_doc(doc)

    def search(self, query: str, k: int = 10):
        """
        Search through the current memory and return the top k results.
        """
        logger.info(f"Searching for '{query}' in the index (top {k} results)")
        results = self.chroma_db.similarity_search(query, k=k)
        logger.info(f'Found {len(results)} results')

        # old code
        # retriever = VectorIndexRetriever(
        #    index=self.index,
        #    similarity_top_k=k,
        # )
        # results = retriever.retrieve(query)
        # return [r.get_text() for r in results]
        # end old code
        return [result.metadata for result in results]
