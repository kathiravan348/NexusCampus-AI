"""M03 API models: `Theme`, `Font` (`contracts/src/studio.ts`) and the mock's theme response / update input."""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, StringConstraints

from nexus.core.schemas import Contract

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")]
TokenName = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")]
RadiusName = Annotated[str, StringConstraints(pattern=r"^radius-[a-z0-9]+(-[a-z0-9]+)*$")]
Px = Annotated[str, StringConstraints(pattern=r"^\d+(\.\d+)?px$")]
FontId = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Density = Literal["compact", "comfortable", "spacious"]
ScopeKind = Literal["platform", "group", "institution", "campus"]
_SAME_ORIGIN = re.compile(r"^/(?![/\\])[^\s\\]*$")
_HTTPS = re.compile(r"^https://[^\s\\]+$")


def _asset_url(value: str) -> str:
    """`https://` URL or a same-origin path; no backslashes anywhere (`/\\host` would load from another origin)."""
    if not (_SAME_ORIGIN.fullmatch(value) or _HTTPS.fullmatch(value)):
        raise ValueError("Must be an https:// URL or a path starting with /")
    return value


AssetUrl = Annotated[str, StringConstraints(max_length=2048), AfterValidator(_asset_url)]


class FontsField(Contract):
    sans: FontId | None
    mono: FontId | None


class AssetsField(Contract):
    logo_url: AssetUrl | None
    favicon_url: AssetUrl | None
    login_image_url: AssetUrl | None


class ScopeOut(Contract):
    kind: ScopeKind
    target_id: str | None


class ThemeOut(Contract):
    id: str
    tenant_id: str
    scope: ScopeOut
    light: dict[str, str]
    dark: dict[str, str]
    fonts: FontsField
    radius: dict[str, str]
    density: Density | None
    assets: AssetsField
    locked_tokens: list[str]
    version: int
    updated_by: str
    updated_at: datetime


class EffectiveTheme(Contract):
    light: dict[str, str]
    dark: dict[str, str]
    fonts: FontsField
    radius: dict[str, str]
    density: Density | None
    assets: AssetsField


class ThemeResponse(Contract):
    effective: EffectiveTheme
    layers: list[ThemeOut]
    locked_tokens: list[str]


class ThemeUpdateIn(Contract):
    light: dict[TokenName, HexColor]
    dark: dict[TokenName, HexColor]
    fonts: FontsField
    radius: dict[RadiusName, Px]
    density: Density | None
    assets: AssetsField


class FontOut(Contract):
    id: str
    family: str
    source: Literal["library", "upload"]
    roles: list[Literal["sans", "mono"]]
    scripts: list[str]
    file_url: str | None
