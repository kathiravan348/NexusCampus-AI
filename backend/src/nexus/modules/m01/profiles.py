"""Institution type profiles (REQUIREMENTS §3): product defaults, not tenant data. Equal to the mocks'
`INSTITUTION_TYPE_PROFILES` (parity test).
"""

from nexus.modules.m01.schemas import TypeProfileOut

CORE = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M83"]


def _profile(type_: str, extra: list[str], structure: str, grading: str) -> TypeProfileOut:
    return TypeProfileOut.model_validate(
        {
            "type": type_,
            "defaultModules": [*CORE, *extra],
            "structure": structure,
            "gradingScheme": grading,
            "terminologyPack": type_,
        }
    )


PROFILES: dict[str, TypeProfileOut] = {
    p.type: p
    for p in (
        _profile("ey", ["M10"], "terms", "grd-ey-observation"),
        _profile("k12", ["M10", "M11"], "terms", "grd-k12-letter"),
        _profile("he", ["M11"], "semesters", "grd-he-gpa4"),
        _profile("tp", ["M10", "M11"], "rolling", "grd-tp-percent"),
        _profile("sk", [], "rolling", "grd-sk-level"),
        _profile("grp", ["M10", "M11"], "terms", "grd-k12-letter"),
    )
}
