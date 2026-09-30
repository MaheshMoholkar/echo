def main() -> None:
    """`uv run echo-api`: serve without auto-reload (use `make api` for dev)."""
    import uvicorn

    uvicorn.run("echo_api.main:app", host="127.0.0.1", port=8000)
