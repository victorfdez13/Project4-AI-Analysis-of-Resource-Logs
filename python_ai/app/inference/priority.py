from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AssessmentNode:
    prediction: str
    distribution: dict[str, int]
    sample_count: int
    feature_name: str | None = None
    threshold: float | None = None
    left: AssessmentNode | None = None
    right: AssessmentNode | None = None
    depth: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


def _majority_label(labels: list[str]) -> str:
    return Counter(labels).most_common(1)[0][0] if labels else "normal"


def _gini(labels: list[str]) -> float:
    if not labels:
        return 0.0

    total = len(labels)
    counts = Counter(labels)
    return 1.0 - sum((count / total) ** 2 for count in counts.values())


def _candidate_thresholds(values: list[float]) -> list[float]:
    unique_values = sorted(set(values))
    return [
        (unique_values[index] + unique_values[index + 1]) / 2.0
        for index in range(len(unique_values) - 1)
    ]


def _best_split(
    rows: list[dict[str, Any]],
    feature_order: list[str],
) -> dict[str, Any] | None:
    parent_labels = [row["risk_label"] for row in rows]
    parent_gini = _gini(parent_labels)
    best: dict[str, Any] | None = None

    for feature_name in feature_order:
        values = [float(row["vector"][feature_name]) for row in rows]
        for threshold in _candidate_thresholds(values):
            left_rows = [
                row for row in rows if float(row["vector"][feature_name]) <= threshold
            ]
            right_rows = [
                row for row in rows if float(row["vector"][feature_name]) > threshold
            ]
            if not left_rows or not right_rows:
                continue

            weighted_gini = (
                (len(left_rows) / len(rows))
                * _gini([row["risk_label"] for row in left_rows])
                + (len(right_rows) / len(rows))
                * _gini([row["risk_label"] for row in right_rows])
            )

            if best is None or weighted_gini < best["gini"]:
                best = {
                    "feature_name": feature_name,
                    "threshold": threshold,
                    "gini": weighted_gini,
                    "left_rows": left_rows,
                    "right_rows": right_rows,
                }

    if best is None or best["gini"] >= parent_gini:
        return None
    return best


def build_priority_assessment(
    rows: list[dict[str, Any]],
    feature_order: list[str],
    max_depth: int = 3,
    min_samples_split: int = 4,
    depth: int = 0,
) -> AssessmentNode:
    labels = [row["risk_label"] for row in rows]
    node = AssessmentNode(
        prediction=_majority_label(labels),
        distribution=dict(Counter(labels)),
        sample_count=len(rows),
        depth=depth,
    )

    if (
        depth >= max_depth
        or len(rows) < min_samples_split
        or len(set(labels)) <= 1
    ):
        return node

    split = _best_split(rows, feature_order)
    if split is None:
        return node

    node.feature_name = split["feature_name"]
    node.threshold = float(split["threshold"])
    node.left = build_priority_assessment(
        split["left_rows"],
        feature_order,
        max_depth=max_depth,
        min_samples_split=min_samples_split,
        depth=depth + 1,
    )
    node.right = build_priority_assessment(
        split["right_rows"],
        feature_order,
        max_depth=max_depth,
        min_samples_split=min_samples_split,
        depth=depth + 1,
    )
    return node


def evaluate_priority_assessment(
    node: AssessmentNode,
    vector: dict[str, float],
) -> dict[str, Any]:
    path: list[str] = []
    current = node

    while (
        current.feature_name is not None
        and current.threshold is not None
        and current.left is not None
        and current.right is not None
    ):
        value = float(vector.get(current.feature_name, 0.0))
        if value <= current.threshold:
            path.append(f"{current.feature_name} <= {current.threshold:.2f}")
            current = current.left
        else:
            path.append(f"{current.feature_name} > {current.threshold:.2f}")
            current = current.right

    total = sum(current.distribution.values()) or 1
    confidence = current.distribution.get(current.prediction, 0) / total
    return {
        "predicted_label": current.prediction,
        "confidence": round(confidence, 3),
        "assessment_path": path or ["no split was needed"],
    }


def extract_assessment_rules(node: AssessmentNode, max_rules: int = 6) -> list[str]:
    collected: list[tuple[int, str]] = []

    def walk(current: AssessmentNode, conditions: list[str]) -> None:
        if (
            current.feature_name is None
            or current.threshold is None
            or current.left is None
            or current.right is None
        ):
            rule = " and ".join(conditions) if conditions else "always"
            collected.append(
                (current.sample_count, f"{rule} => {current.prediction}")
            )
            return

        walk(
            current.left,
            [*conditions, f"{current.feature_name} <= {current.threshold:.2f}"],
        )
        walk(
            current.right,
            [*conditions, f"{current.feature_name} > {current.threshold:.2f}"],
        )

    walk(node, [])
    collected.sort(key=lambda item: item[0], reverse=True)
    return [rule for _, rule in collected[:max_rules]]
