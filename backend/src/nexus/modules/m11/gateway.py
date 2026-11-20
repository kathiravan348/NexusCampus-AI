"""The AI gateway (NEX-058, ARCHITECTURE §7, D24, A-8): the **only** place that calls a model.

Features ask for a capability tier, never a vendor model; the tier → model map lives in settings (DECISIONS).
Providers: `FakeProvider` (deterministic, tests and dev, no network) and `ClaudeProvider` (official `anthropic` SDK:
direct API in dev, Claude on Amazon Bedrock in the cell's own region for SaaS, G-5).
"""

from dataclasses import dataclass
from typing import Literal, Protocol

from nexus.settings import Settings

Tier = Literal["fast", "balanced", "reasoning", "embedding", "multimodal"]
#: Credits one answer costs per tier (A-1).
CREDIT_COST: dict[str, int] = {"fast": 1, "balanced": 2, "reasoning": 5, "multimodal": 3}
#: Cell region → AWS region (D45).
AWS_REGION = {"in": "ap-south-1", "eu": "eu-central-1"}


@dataclass(frozen=True)
class Completion:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    refused: bool = False


class Provider(Protocol):
    async def complete(self, model: str, system: str, prompt: str, max_tokens: int) -> Completion: ...


@dataclass
class Gateway:
    provider: Provider
    models: dict[str, str]

    def model_for(self, tier: str) -> str:
        return self.models.get(tier) or self.models["balanced"]

    async def answer(self, tier: str, system: str, prompt: str) -> Completion:
        return await self.provider.complete(self.model_for(tier), system, prompt, max_tokens=2000)


def tier_models(settings: Settings) -> dict[str, str]:
    models = {
        "fast": settings.ai_model_fast,
        "balanced": settings.ai_model_balanced,
        "reasoning": settings.ai_model_reasoning,
        "multimodal": settings.ai_model_balanced,
    }
    if settings.ai_provider == "bedrock":
        models = {k: f"anthropic.{v}" for k, v in models.items()}
    return models


def build_gateway(settings: Settings) -> Gateway:
    """The gateway for this cell. Imported lazily so tests and dev need no network client."""
    if settings.ai_provider == "fake":
        from nexus.modules.m11.providers.fake import FakeProvider

        return Gateway(FakeProvider(), tier_models(settings))
    from nexus.modules.m11.providers.claude import ClaudeProvider

    return Gateway(ClaudeProvider.from_settings(settings, AWS_REGION[settings.region]), tier_models(settings))
