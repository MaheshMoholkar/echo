"""Split a document into passages ("chunks") small enough to search precisely.

Why chunk at all: a whole document has one embedding, which blurs every
topic in it together, and pasting whole documents into the prompt is slow
(prefill runs at ~360 tokens/s on an M4 Mac mini). Small chunks let search return
just the passages that answer the question.

How big: ~1,000 characters (~250 tokens). Smaller chunks match more
precisely but lose context; bigger ones keep context but cost prompt time
and dilute the match. Top 4 results ≈ 1,000 tokens ≈ 3 s of cold prefill.

Overlap: the end of one chunk is repeated at the start of the next, so a
fact that straddles a boundary still appears whole in one of them.

Sections first (chunk_markdown): a chunk that mixes topics gets an
embedding that is a blur of them all. Measured on a 5-section help center,
size-only chunking made 2 mixed chunks: "do I have to pay customs?" matched
the returns chunk, and answerable vs unanswerable questions overlapped in
distance (0.29-0.44 vs 0.42-0.51), so no cutoff could separate them.
"""

import re

CHUNK_CHARS = 1000
OVERLAP_CHARS = 150

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$", re.MULTILINE)
_PARAGRAPHS = re.compile(r"\n\s*\n")
_SENTENCES = re.compile(r"(?<=[.!?])\s+")


def _pieces(text: str, size: int) -> list[str]:
    """Paragraphs, with any paragraph longer than `size` split by sentence,
    and any sentence longer than `size` cut."""
    pieces: list[str] = []
    for paragraph in _PARAGRAPHS.split(text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) <= size:
            pieces.append(paragraph)
            continue
        buffer = ""
        for sentence in _SENTENCES.split(paragraph):
            while len(sentence) > size:
                if buffer:
                    pieces.append(buffer)
                    buffer = ""
                pieces.append(sentence[:size])
                sentence = sentence[size:]
            if buffer and len(buffer) + 1 + len(sentence) > size:
                pieces.append(buffer)
                buffer = sentence
            else:
                buffer = f"{buffer} {sentence}".strip()
        if buffer:
            pieces.append(buffer)
    return pieces


def _tail(text: str, overlap: int) -> str:
    """The last ~`overlap` characters, starting at a word boundary."""
    if overlap <= 0 or len(text) <= overlap:
        return ""
    tail = text[-overlap:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 else tail


def chunk_text(
    text: str, size: int = CHUNK_CHARS, overlap: int = OVERLAP_CHARS
) -> list[str]:
    """Pack whole paragraphs into chunks of at most ~`size` characters
    (a chunk can exceed it by the overlap carried in from the previous one)."""
    chunks: list[str] = []
    current = ""
    for piece in _pieces(text, size):
        if current and len(current) + 2 + len(piece) > size:
            chunks.append(current)
            tail = _tail(current, overlap)
            current = f"{tail}\n\n{piece}" if tail else piece
        else:
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


def chunk_markdown(
    text: str, size: int = CHUNK_CHARS, overlap: int = OVERLAP_CHARS
) -> list[str]:
    """Chunk each Markdown section on its own, so no chunk mixes sections.

    Every chunk starts with its heading trail ("Help Center > Refunds"): the
    passage "within 30 days" means little without knowing what it is about,
    to the embedding model and to the chat model reading search results.
    Text without headings is a single section.
    """
    sections: list[tuple[str, str]] = []
    trail: list[tuple[int, str]] = []
    position = 0
    for match in _HEADING.finditer(text):
        sections.append(
            (" > ".join(title for _, title in trail), text[position : match.start()])
        )
        level = len(match.group(1))
        trail = [(lvl, title) for lvl, title in trail if lvl < level]
        trail.append((level, match.group(2)))
        position = match.end()
    sections.append((" > ".join(title for _, title in trail), text[position:]))

    chunks: list[str] = []
    for heading, body in sections:
        for passage in chunk_text(body, size, overlap):
            chunks.append(f"{heading}\n\n{passage}" if heading else passage)
    return chunks
