"""
Grading rules shared by the gradebook API and the seed.
- Weighted percentage over categories that have marks.
- Letter / grade-point scale; credit-weighted GPA.
"""
from typing import Optional

SCALE = [(90, "A+", 4.0), (85, "A", 3.8), (80, "A-", 3.6), (75, "B+", 3.3), (70, "B", 3.0),
         (65, "B-", 2.7), (60, "C+", 2.4), (55, "C", 2.2), (50, "D", 2.0), (0, "F", 0.0)]


def letter_for(percent: Optional[float]) -> tuple[str, float]:
    if percent is None:
        return "—", 0.0
    for threshold, letter, points in SCALE:
        if percent >= threshold:
            return letter, points
    return "F", 0.0


def weighted_percent(categories: list[dict], assessments: list[dict], marks: dict) -> Optional[float]:
    """categories: [{id, weight}], assessments: [{id, category_id, max_marks}], marks: {assessment_id: value|None}"""
    total_weight = 0.0
    accumulated = 0.0
    for category in categories:
        scored = [a for a in assessments
                  if str(a["category_id"]) == str(category["id"]) and marks.get(str(a["id"])) is not None]
        if not scored:
            continue
        maximum = sum(float(a["max_marks"]) for a in scored)
        if maximum <= 0:
            continue
        pct = sum(float(marks[str(a["id"])]) for a in scored) / maximum * 100
        accumulated += pct * float(category["weight"])
        total_weight += float(category["weight"])
    return round(accumulated / total_weight, 2) if total_weight else None


def gpa_from_courses(courses: list[dict]) -> tuple[Optional[float], int]:
    credits = sum(int(c.get("credits") or 0) for c in courses)
    if not credits:
        return None, 0
    points = sum(float(c.get("grade_points") or 0) * int(c.get("credits") or 0) for c in courses)
    return round(points / credits, 2), credits
