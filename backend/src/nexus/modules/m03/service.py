"""M03 theme layers (NEX-053, C-1, D28): merge (outer layers first; a locked token cannot change below), the
mock's validation order, and the server-side contrast guard on the merged result."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.modules.m03.contrast import COLOR_TOKEN_NAMES, RADIUS_TOKEN_NAMES, check_theme
from nexus.modules.m03.schemas import AssetsField, EffectiveTheme, FontsField, ThemeOut, ThemeUpdateIn

ORDER = {"platform": 0, "group": 1, "institution": 2, "campus": 3}
THEME_SELECT = (
    "SELECT id, tenant_id, scope_kind, scope_target_id, light, dark, fonts, radius, density, assets, locked_tokens, "
    "version, updated_by, updated_at FROM themes"
)


def theme_out(row: Any) -> ThemeOut:
    r = dict(row)
    r["scope"] = {"kind": r.pop("scope_kind"), "target_id": r.pop("scope_target_id")}
    return ThemeOut.model_validate(r)


async def tenant_layers(db: AsyncSession) -> list[ThemeOut]:
    rows = (await db.execute(text(THEME_SELECT))).mappings().all()
    return sorted((theme_out(r) for r in rows), key=lambda t: (ORDER[t.scope.kind], t.id))


def merge_themes(layers: list[ThemeOut]) -> tuple[EffectiveTheme, list[str]]:
    """The theme a screen applies and every locked token (same as the mock's `mergeThemes`)."""
    light: dict[str, str] = {}
    dark: dict[str, str] = {}
    radius: dict[str, str] = {}
    fonts = FontsField(sans=None, mono=None)
    assets = AssetsField(logo_url=None, favicon_url=None, login_image_url=None)
    density = None
    locked: set[str] = set()
    for layer in layers:
        for into, source in ((light, layer.light), (dark, layer.dark), (radius, layer.radius)):
            into.update({k: v for k, v in source.items() if k not in locked})
        fonts = FontsField(sans=layer.fonts.sans or fonts.sans, mono=layer.fonts.mono or fonts.mono)
        density = layer.density or density
        assets = AssetsField(
            logo_url=layer.assets.logo_url or assets.logo_url,
            favicon_url=layer.assets.favicon_url or assets.favicon_url,
            login_image_url=layer.assets.login_image_url or assets.login_image_url,
        )
        locked.update(layer.locked_tokens)
    effective = EffectiveTheme(light=light, dark=dark, fonts=fonts, radius=radius, density=density, assets=assets)
    return effective, sorted(locked)


def unknown_tokens(data: ThemeUpdateIn, font_ids: set[str]) -> list[ApiErrorDetail]:
    bad = [
        ApiErrorDetail(path=f"{mode}.{token}", message=f"Unknown colour token: {token}")
        for mode in ("light", "dark")
        for token in getattr(data, mode)
        if token not in COLOR_TOKEN_NAMES
    ]
    bad += [
        ApiErrorDetail(path=f"radius.{t}", message=f"Unknown radius token: {t}")
        for t in data.radius
        if t not in RADIUS_TOKEN_NAMES
    ]
    for role in ("sans", "mono"):
        font = getattr(data.fonts, role)
        if font is not None and font not in font_ids:
            bad.append(ApiErrorDetail(path=f"fonts.{role}", message=f"Unknown font id: {font}"))
    return bad


def locked_conflicts(data: ThemeUpdateIn, locked: set[str]) -> list[ApiErrorDetail]:
    return [
        ApiErrorDetail(path=f"{section}.{token}", message=f"Token {token} is locked by a parent theme layer")
        for section in ("light", "dark", "radius")
        for token in getattr(data, section)
        if token in locked
    ]


def contrast_failures(effective: EffectiveTheme) -> list[ApiErrorDetail]:
    return [
        ApiErrorDetail(path=f"{f.theme}.{f.pair.fg}", message=f.message)
        for f in check_theme(effective.light, effective.dark)
    ]


def invalid(details: list[ApiErrorDetail]) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", details)
