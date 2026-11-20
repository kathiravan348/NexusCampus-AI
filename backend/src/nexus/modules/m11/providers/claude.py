"""Claude through the official `anthropic` SDK (NEX-058). Used only by `gateway.py`.

- dev: direct Claude API with `NEXUS_ANTHROPIC_API_KEY` from `backend/.env` (never in code);
- SaaS: Claude on Amazon Bedrock (`AsyncAnthropicBedrockMantle`) in the cell's own AWS region, so prompts stay in
  the tenant's region (G-5, D45). AWS credentials come from the environment / instance role.

On the direct API the request opts into server-side refusal fallbacks (`fallbacks="default"`); Bedrock has no
server-side fallbacks. A refused answer is reported as `refused`, never shown as text.
"""

from dataclasses import dataclass
from typing import Any

from anthropic import AsyncAnthropic, AsyncAnthropicBedrockMantle

from nexus.modules.m11.gateway import Completion
from nexus.settings import Settings

FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass
class ClaudeProvider:
    client: Any
    direct: bool

    @classmethod
    def from_settings(cls, settings: Settings, aws_region: str) -> "ClaudeProvider":
        if settings.ai_provider == "bedrock":
            return cls(AsyncAnthropicBedrockMantle(aws_region=aws_region), direct=False)
        key = settings.anthropic_api_key.get_secret_value()
        if not key:
            raise RuntimeError("NEXUS_ANTHROPIC_API_KEY is not set")
        return cls(AsyncAnthropic(api_key=key), direct=True)

    async def complete(self, model: str, system: str, prompt: str, max_tokens: int) -> Completion:
        request: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        }
        if self.direct:
            response = await self.client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **request)
        else:
            response = await self.client.messages.create(**request)
        usage = response.usage
        tokens = (int(usage.input_tokens or 0), int(usage.output_tokens or 0))
        if response.stop_reason == "refusal":
            return Completion("", response.model, *tokens, refused=True)
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        return Completion(text, response.model, *tokens)
