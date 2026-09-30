from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.settings import ModelSettings

from echo_api.config import get_settings

# qwen3.5 reasons before answering by default, which costs seconds per reply.
# PydanticAI's generic `thinking=False` is ignored by Ollama; this works
# (measured: 1.8 s instead of 5.8 s, 46 instead of 146 tokens).
NO_THINKING: ModelSettings = {"openai_reasoning_effort": "none"}


def chat_model() -> OllamaModel:
    settings = get_settings()
    return OllamaModel(
        settings.chat_model,
        provider=OllamaProvider(base_url=settings.ollama_base_url),
    )
