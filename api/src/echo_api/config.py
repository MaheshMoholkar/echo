from functools import lru_cache
from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# api/src/echo_api/config.py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Everything comes from environment variables.

    `.env` at the repo root (see `.env.example`). Real environment variables
    win over it.
    """

    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        extra="ignore",
    )

    database_url: str

    # Ollama's OpenAI-compatible API.
    ollama_base_url: str = "http://localhost:11434/v1"
    chat_model: str = "qwen3.5:4b"
    embedding_model: str = "nomic-embed-text"
    # Fixed by the model; the vector column is created with this size, so
    # changing the embedding model means a migration and re-embedding.
    embedding_dimensions: int = 768
    # Optional: reads scanned PDFs and images in the knowledge base.
    ocr_model: str = "glm-ocr:q8_0"

    # Better Auth runs inside the Next.js app; it signs the JWTs we verify.
    # Same variable Next.js uses, from the root .env.
    better_auth_url: str = "http://localhost:3000"
    auth_audience: str = "echo-api"  # must match API_AUDIENCE in web/lib/auth.ts

    @property
    def auth_issuer(self) -> str:
        return self.better_auth_url

    @property
    def auth_jwks_url(self) -> str:
        return f"{self.better_auth_url}/api/auth/jwks"

    @computed_field
    @property
    def sqlalchemy_url(self) -> str:
        """`postgres://…` from the lab, in the form SQLAlchemy + psycopg 3 expects."""
        scheme, rest = self.database_url.split("://", 1)
        if scheme in ("postgres", "postgresql"):
            scheme = "postgresql+psycopg"
        return f"{scheme}://{rest}"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
