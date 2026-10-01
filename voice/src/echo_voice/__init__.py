from pydantic_settings import BaseSettings, SettingsConfigDict

from echo_api.config import REPO_ROOT


class ServerSettings(BaseSettings):
    """Where the bot listens: VOICE_HOST and VOICE_PORT, from the environment
    or the root `.env` like the other settings.

    The default only accepts connections from this machine. To run the bot on
    another machine than the web app, set VOICE_HOST to an address of a
    private network both are on: the browser must reach it too, for the audio.
    """

    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_prefix="VOICE_",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8001


def main() -> None:
    """`uv run echo-voice`: serve the voice bot's signaling endpoint."""
    import uvicorn

    settings = ServerSettings()
    uvicorn.run("echo_voice.server:app", host=settings.host, port=settings.port)
