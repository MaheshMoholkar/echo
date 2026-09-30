import httpx
import pytest


@pytest.mark.asyncio
async def test_health_reaches_lab_postgres_and_ollama(
    client: httpx.AsyncClient,
) -> None:
    """Integration check: needs `lab up` (Postgres + pgvector) and Ollama running."""
    response = await client.get("/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["database"]["ok"], body["database"]
    assert body["ollama"]["ok"], body["ollama"]
    assert body["status"] == "ok"
