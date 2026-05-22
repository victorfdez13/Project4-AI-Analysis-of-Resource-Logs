from collections import Counter
from typing import Any

from app.feature_engineering import vector_as_list


def _choose_group_count(sample_size: int) -> int:
    if sample_size >= 12:
        return 3
    if sample_size >= 6:
        return 2
    return 1


def _squared_distance(left: list[float], right: list[float]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right))


def _mean_vector(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return []

    width = len(vectors[0])
    return [
        sum(vector[column] for vector in vectors) / len(vectors)
        for column in range(width)
    ]


def _initial_centers(vectors: list[list[float]], group_count: int) -> list[list[float]]:
    if group_count == 1:
        return [vectors[0]]

    last_index = len(vectors) - 1
    centers: list[list[float]] = []
    for index in range(group_count):
        source_index = round((last_index * index) / max(1, group_count - 1))
        centers.append(list(vectors[source_index]))
    return centers


def build_log_groups(
    rows: list[dict[str, Any]],
    feature_order: list[str],
    group_count: int | None = None,
) -> dict[str, Any]:
    if not rows:
        return {"assignments": [], "groups": []}

    vectors = [vector_as_list(row["vector"]) for row in rows]
    total_groups = min(len(rows), group_count or _choose_group_count(len(rows)))
    centers = _initial_centers(vectors, total_groups)
    assignments = [0 for _ in vectors]

    for _ in range(12):
        new_assignments = [
            min(
                range(total_groups),
                key=lambda group_id: _squared_distance(vector, centers[group_id]),
            )
            for vector in vectors
        ]

        if new_assignments == assignments:
            break

        assignments = new_assignments
        for group_id in range(total_groups):
            members = [
                vector
                for index, vector in enumerate(vectors)
                if assignments[index] == group_id
            ]
            if members:
                centers[group_id] = _mean_vector(members)

    groups: list[dict[str, Any]] = []
    for group_id in range(total_groups):
        members = [
            rows[index]
            for index in range(len(rows))
            if assignments[index] == group_id
        ]
        categories = Counter(
            str(member["log"].get("category") or "UnknownCategory")
            for member in members
        )
        dominant_categories = [name for name, _ in categories.most_common(3)]
        risk_labels = Counter(member["risk_label"] for member in members)
        average_risk = (
            round(
                sum(float(member["risk_score"]) for member in members) / len(members),
                2,
            )
            if members
            else 0.0
        )

        groups.append(
            {
                "group_id": group_id,
                "size": len(members),
                "average_risk": average_risk,
                "dominant_risk_label": (
                    risk_labels.most_common(1)[0][0] if risk_labels else "normal"
                ),
                "dominant_categories": dominant_categories,
                "center": {
                    feature_order[index]: round(value, 3)
                    for index, value in enumerate(centers[group_id])
                },
                "summary": (
                    f"Mostly {', '.join(dominant_categories) if dominant_categories else 'mixed'} "
                    f"logs with average heuristic risk {average_risk}."
                ),
            }
        )

    return {"assignments": assignments, "groups": groups}
