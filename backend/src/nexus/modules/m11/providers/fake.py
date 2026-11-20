"""Deterministic provider for tests and dev (NEX-058): no network. It "answers" with the first context line, so
tests can check that redacted placeholders survive the round trip and are restored."""

from dataclasses import dataclass, field

from nexus.modules.m11.gateway import Completion


@dataclass
class FakeProvider:
    calls: list[tuple[str, str]] = field(default_factory=list)
    refuse: bool = False

    async def complete(self, model: str, system: str, prompt: str, max_tokens: int) -> Completion:
        self.calls.append((model, prompt))
        if self.refuse:
            return Completion("", model, len(prompt) // 4, 0, refused=True)
        context = prompt.split("Context:\n", 1)[-1].split("\n\nQuestion:", 1)[0]
        first = next((line.split("] ", 1)[-1] for line in context.splitlines() if line.strip()), "")
        return Completion(f"According to the records: {first}", model, len(prompt) // 4, len(first) // 4)
