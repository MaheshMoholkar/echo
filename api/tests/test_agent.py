"""Pure pieces of the agent: no model, no database."""

from echo_api import agent, knowledge
from echo_api.models import Message, MessageRole


def test_retrieval_query() -> None:
    earlier = ["How long does delivery take?"]
    assert agent.retrieval_query(earlier, "And abroad?") == (
        "How long does delivery take?\nAnd abroad?"
    )
    long_question = (
        "What happens if my package arrives damaged and I want a replacement?"
    )
    assert agent.retrieval_query(earlier, long_question) == long_question
    assert agent.retrieval_query([], "And abroad?") == "And abroad?"


def test_customer_texts_keeps_only_the_customers_words() -> None:
    messages = [
        Message(role=MessageRole.assistant, content="Hi!"),
        Message(role=MessageRole.customer, content="Delivery time?"),
        Message(role=MessageRole.operator, content="3-5 days."),
    ]
    assert agent.customer_texts(messages) == ["Delivery time?"]


def test_prompt_puts_results_after_the_message_in_tagged_sections() -> None:
    hits = [
        knowledge.SearchHit(
            filename="refunds.md", content="Within 30 days.", distance=0.3
        )
    ]
    prompt = agent.build_prompt("Can I return it?", hits)
    assert prompt == (
        "<customer_message>\nCan I return it?\n</customer_message>\n\n"
        "<knowledge_base>\n[1] From refunds.md:\nWithin 30 days.\n\n"
        f"{agent.RESULTS_NOTE}\n</knowledge_base>"
    )
    assert agent.build_prompt("Hi", [], note="Say so briefly.").endswith(
        "Say so briefly.\n</knowledge_base>"
    )
