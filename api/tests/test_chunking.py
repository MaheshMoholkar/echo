from itertools import pairwise

from echo_api.chunking import chunk_markdown, chunk_text


def test_short_text_is_one_chunk() -> None:
    assert chunk_text("  # Refunds\n\nReturn within 30 days.  ") == [
        "# Refunds\n\nReturn within 30 days."
    ]


def test_paragraphs_are_packed_up_to_the_size() -> None:
    paragraphs = [f"Paragraph {i}. " + "word " * 30 for i in range(20)]
    chunks = chunk_text("\n\n".join(paragraphs), size=500, overlap=80)

    assert len(chunks) > 1
    assert all(0 < len(chunk) <= 500 + 80 + 2 for chunk in chunks)
    for paragraph in paragraphs:  # nothing is lost
        assert any(paragraph.strip() in chunk for chunk in chunks)


def test_consecutive_chunks_overlap() -> None:
    text = "\n\n".join(f"Fact number {i} is about topic {i}." for i in range(60))
    chunks = chunk_text(text, size=300, overlap=60)

    # The start of each chunk repeats the end of the one before.
    for previous, following in pairwise(chunks):
        carried = following.split("\n\n")[0]
        assert carried in previous


def test_long_paragraph_is_split_by_sentence() -> None:
    paragraph = " ".join(f"Sentence {i} explains one detail." for i in range(100))
    chunks = chunk_text(paragraph, size=400, overlap=0)

    assert len(chunks) > 1
    assert all(len(chunk) <= 400 for chunk in chunks)
    assert all(chunk.endswith(".") for chunk in chunks)  # cut at sentence ends


def test_text_without_breaks_is_hard_cut() -> None:
    chunks = chunk_text("x" * 2500, size=1000, overlap=0)
    assert [len(chunk) for chunk in chunks] == [1000, 1000, 500]


def test_blank_text_gives_no_chunks() -> None:
    assert chunk_text("\n\n   \n") == []


def test_markdown_sections_are_never_mixed() -> None:
    text = (
        "# Help Center\n\nWelcome.\n\n"
        "## Shipping\n\nOrders ship in 2 days.\n\n"
        "## Returns\n\nReturn within 30 days.\n\n"
        "### Damaged items\n\nWe refund shipping too."
    )
    assert chunk_markdown(text) == [
        "Help Center\n\nWelcome.",
        "Help Center > Shipping\n\nOrders ship in 2 days.",
        "Help Center > Returns\n\nReturn within 30 days.",
        "Help Center > Returns > Damaged items\n\nWe refund shipping too.",
    ]


def test_long_section_is_split_and_each_part_keeps_its_heading() -> None:
    body = "\n\n".join(f"Refund rule {i}: " + "detail " * 20 for i in range(12))
    chunks = chunk_markdown(f"# Refunds\n\n{body}", size=400, overlap=50)
    assert len(chunks) > 1
    assert all(chunk.startswith("Refunds\n\n") for chunk in chunks)


def test_text_without_headings_is_one_section() -> None:
    assert chunk_markdown("Just a note.\n\nAnother line.") == [
        "Just a note.\n\nAnother line."
    ]
