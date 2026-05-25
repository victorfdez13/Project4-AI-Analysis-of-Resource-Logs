from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.context_layer import AnalysisContext
from app.feature_engineering import FEATURE_ORDER, build_feature_rows, stable_log_key
from app.inference.grouping import build_log_groups
from app.inference.movement import measure_activity_movement
from app.inference.priority import (
    AssessmentNode,
    build_priority_assessment,
    evaluate_priority_assessment,
    extract_assessment_rules,
)


@dataclass
class ModelLayerResult:
    rows: list[dict[str, Any]]
    anchor_row: dict[str, Any]
    grouping_result: dict[str, Any]
    anchor_group: dict[str, Any]
    assessment_model: AssessmentNode
    assessment_result: dict[str, Any]
    movement_signal: dict[str, Any]


def _default_group(anchor_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "group_id": 0,
        "group_count": 1,
        "group_size": 1,
        "average_risk": float(anchor_row["risk_score"]),
        "dominant_categories": [
            str(anchor_row["log"].get("category") or "UnknownCategory")
        ],
        "summary": "Only the anchor log was available for analysis.",
    }


def run_model_layer(context: AnalysisContext) -> ModelLayerResult:
    rows = build_feature_rows(context.comparison_logs, user_prompt=context.user_prompt)
    if not rows:
        rows = build_feature_rows([context.anchor_log], user_prompt=context.user_prompt)

    anchor_key = stable_log_key(context.anchor_log)
    anchor_index = next(
        (
            index
            for index, row in enumerate(rows)
            if stable_log_key(row["log"]) == anchor_key
        ),
        0,
    )
    anchor_row = rows[anchor_index]

    grouping_result = build_log_groups(rows, FEATURE_ORDER)
    anchor_group = _default_group(anchor_row)
    if grouping_result["groups"] and grouping_result["assignments"]:
        group_id = grouping_result["assignments"][anchor_index]
        matched_group = next(
            (
                group
                for group in grouping_result["groups"]
                if group["group_id"] == group_id
            ),
            None,
        )
        if matched_group is not None:
            anchor_group = {
                "group_id": int(matched_group["group_id"]),
                "group_count": len(grouping_result["groups"]),
                "group_size": int(matched_group["size"]),
                "average_risk": float(matched_group["average_risk"]),
                "dominant_categories": list(matched_group["dominant_categories"]),
                "summary": str(matched_group["summary"]),
            }

    assessment_model = build_priority_assessment(rows, FEATURE_ORDER)
    assessment_result = evaluate_priority_assessment(
        assessment_model,
        anchor_row["vector"],
    )
    movement_signal = measure_activity_movement(rows)

    return ModelLayerResult(
        rows=rows,
        anchor_row=anchor_row,
        grouping_result=grouping_result,
        anchor_group=anchor_group,
        assessment_model=assessment_model,
        assessment_result=assessment_result,
        movement_signal=movement_signal,
    )


def study_model_layer(dataset: str, logs: list[dict[str, Any]]) -> dict[str, Any]:
    rows = build_feature_rows(logs)
    grouping_result = build_log_groups(rows, FEATURE_ORDER)
    assessment_model = build_priority_assessment(rows, FEATURE_ORDER)

    return {
        "dataset": dataset,
        "sample_size": len(rows),
        "group_overview": [
            {
                "group_id": int(group["group_id"]),
                "size": int(group["size"]),
                "average_risk": float(group["average_risk"]),
                "dominant_risk_label": str(group["dominant_risk_label"]),
                "dominant_categories": list(group["dominant_categories"]),
                "summary": str(group["summary"]),
            }
            for group in grouping_result["groups"]
        ],
        "assessment_rules": extract_assessment_rules(assessment_model),
        "activity_movement": measure_activity_movement(rows),
    }
