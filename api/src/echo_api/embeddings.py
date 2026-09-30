"""Text → vectors with Ollama's nomic-embed-text (768 numbers per text).

Texts with similar meaning get vectors that point in similar directions, so
"how do I get my money back?" lands near a passage about refunds even though
they share no words. That is what makes search by meaning possible.
"""

from pydantic_ai.embeddings import Embedder
from pydantic_ai.embeddings.openai import OpenAIEmbeddingModel
from pydantic_ai.providers.ollama import OllamaProvider

from echo_api.config import get_settings

# nomic-embed-text was trained with task prefixes: stored passages and
# search queries are embedded slightly differently. PydanticAI doesn't add
# them for this model, so we do. (On a 4-passage test both ways scored 4/4;
# we follow the model card.)
DOCUMENT_PREFIX = "search_document: "
QUERY_PREFIX = "search_query: "
BATCH_SIZE = 32


def _embedder() -> Embedder:
    settings = get_settings()
    model = OpenAIEmbeddingModel(
        settings.embedding_model,
        provider=OllamaProvider(base_url=settings.ollama_base_url),
    )
    return Embedder(model)


embedder = _embedder()


def _check(vectors: list[list[float]]) -> list[list[float]]:
    expected = get_settings().embedding_dimensions
    for vector in vectors:
        if len(vector) != expected:
            raise ValueError(
                f"expected {expected}-dimension embeddings, got {len(vector)}"
            )
    return vectors


async def embed_documents(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = [DOCUMENT_PREFIX + text for text in texts[start : start + BATCH_SIZE]]
        result = await embedder.embed_documents(batch)
        vectors.extend(list(v) for v in result.embeddings)
    return _check(vectors)


async def embed_query(text: str) -> list[float]:
    result = await embedder.embed_query(QUERY_PREFIX + text)
    return _check([list(result.embeddings[0])])[0]
