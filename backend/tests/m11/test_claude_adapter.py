"""Claude adapter (NEX-058) against a stub SDK client — no network in `backend-check`."""

from types import SimpleNamespace
from typing import Any

import pytest

from nexus.modules.m11.gateway import tier_models
from nexus.modules.m11.providers.claude import FALLBACK_BETA, ClaudeProvider
from nexus.settings import Settings

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class StubMessages:
    def __init__(self, stop_reason: str) -> None:
        self.stop_reason = stop_reason
        self.requests: list[dict[str, Any]] = []

    async def create(self, **request: Any) -> Any:
        self.requests.append(request)
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            model=request["model"],
            usage=SimpleNamespace(input_tokens=120, output_tokens=30),
            content=[SimpleNamespace(type="thinking"), SimpleNamespace(type="text", text=" The term ends in June. ")],
        )


def stub_client(stop_reason: str = "end_turn") -> Any:
    messages = StubMessages(stop_reason)
    return SimpleNamespace(messages=messages, beta=SimpleNamespace(messages=messages))


async def test_direct_api_opts_into_refusal_fallbacks_and_reads_text() -> None:
    client = stub_client()
    done = await ClaudeProvider(client, direct=True).complete("claude-sonnet-5-5", "sys", "q", 2000)
    sent = client.messages.requests[0]
    assert sent["betas"] == [FALLBACK_BETA] and sent["fallbacks"] == "default"
    assert sent["messages"] == [{"role": "user", "content": "q"}] and "temperature" not in sent
    assert (done.text, done.input_tokens, done.output_tokens, done.refused) == (
        "The term ends in June.",
        120,
        30,
        False,
    )


async def test_bedrock_sends_a_plain_request_and_refusals_are_flagged() -> None:
    client = stub_client("refusal")
    done = await ClaudeProvider(client, direct=False).complete("anthropic.claude-sonnet-5-5", "sys", "q", 2000)
    assert "fallbacks" not in client.messages.requests[0] and done.refused and done.text == ""


def test_tier_map_and_bedrock_prefix() -> None:
    assert tier_models(Settings(ai_provider="fake"))["reasoning"] == "claude-opus-5-5"
    assert tier_models(Settings(ai_provider="bedrock"))["fast"] == "anthropic.claude-haiku-5-5"


def test_direct_api_needs_a_key() -> None:
    with pytest.raises(RuntimeError):
        ClaudeProvider.from_settings(Settings(ai_provider="anthropic", anthropic_api_key=""), "ap-south-1")  # type: ignore[arg-type]
