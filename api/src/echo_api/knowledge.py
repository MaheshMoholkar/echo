"""Search an organization's knowledge base by meaning."""

from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import embeddings
from echo_api.models import Chunk, Document, DocumentStatus

TOP_K = 4
# Cosine distance: 0 = same direction, 1 = unrelated, 2 = opposite.
# A noise floor, not a relevance judge. Measured with nomic-embed-text on a
# 5-section help center: the best match for answerable questions was
# 0.26-0.44 away, for unanswerable ones 0.41-0.49. They overlap, so distance
# alone can't tell "answerable"; this drops the clear junk and the chat
# model makes the final call ("answer only from what search returns").
# Dropping a relevant passage is worse than passing an irrelevant one.
MAX_DISTANCE = 0.45


@dataclass
class SearchHit:
    filename: str
    content: str
    distance: float


async def search(
    db: AsyncSession,
    organization_id: str,
    query: str,
    limit: int = TOP_K,
    max_distance: float = MAX_DISTANCE,
) -> list[SearchHit]:
    vector = await embeddings.embed_query(query)

    # An HNSW index returns the nearest neighbours *overall*; filtering by
    # organization afterwards could leave fewer than `limit` rows (or none)
    # when other tenants own most of the nearby vectors. pgvector 0.8's
    # iterative scan keeps walking the index until enough rows pass the
    # filter. SET LOCAL: only for this transaction.
    await db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))

    distance = Chunk.embedding.cosine_distance(vector).label("distance")
    rows = (
        await db.execute(
            select(Chunk.content, Document.filename, distance)
            .join(Document, Chunk.document_id == Document.id)
            .where(
                Chunk.organization_id == organization_id,
                Document.status == DocumentStatus.ready,
            )
            .order_by(distance)
            .limit(limit)
        )
    ).all()
    return [
        SearchHit(filename=row.filename, content=row.content, distance=row.distance)
        for row in rows
        if row.distance <= max_distance
    ]


def format_hits(hits: list[SearchHit]) -> str:
    """What the model sees as the tool's result."""
    if not hits:
        return "No relevant information found in the knowledge base."
    return "\n\n".join(
        f"[{index}] From {hit.filename}:\n{hit.content}"
        for index, hit in enumerate(hits, 1)
    )
