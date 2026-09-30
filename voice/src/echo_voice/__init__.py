def main() -> None:
    """`uv run echo-voice`: serve the voice bot's signaling endpoint on :8001."""
    import uvicorn

    uvicorn.run("echo_voice.server:app", host="127.0.0.1", port=8001)
