from __future__ import annotations

from typing import Any

from app.context_layer import AnalysisContext
from app.explainers import get_explanation_engine
from app.feature_engineering import collect_prompt_matches
from app.model_layer import ModelLayerResult


def _unique_preserving_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)

    return result


def _build_related_resources(logs: list[dict[str, Any]]) -> list[str]:
    related: list[str] = []

    for log in logs:
        dataset = log.get("datasetName")
        log_id = log.get("logId")
        if dataset and log_id is not None:
            related.append(f"log:{dataset}:{log_id}")

        main_entity = log.get("mainEntityId")
        if main_entity is not None:
            related.append(f"mainEntityId:{main_entity}")

        impersonator = log.get("impersonatorMainEntityId")
        if impersonator is not None:
            related.append(f"impersonatorMainEntityId:{impersonator}")

        session_id = log.get("sessionId")
        if session_id:
            related.append(f"sessionId:{session_id}")

        for entity in log.get("entities") or []:
            if not isinstance(entity, dict):
                continue
            entity_type = entity.get("entityType")
            entity_id = entity.get("entityId")
            if entity_type is not None and entity_id is not None:
                related.append(f"entity:{entity_type}:{entity_id}")

    return _unique_preserving_order(related)[:24]


def _detect_anomalies(
    context: AnalysisContext,
    model_result: ModelLayerResult,
    prompt_matches: list[str],
) -> list[str]:
    vector = model_result.anchor_row["vector"]
    risk_score = int(model_result.anchor_row["risk_score"])
    anchor_group = model_result.anchor_group
    movement_signal = model_result.movement_signal

    anomalies: list[str] = []

    if vector["repeated_error_count"] >= 1:
        anomalies.append("The same error shows up repeatedly in related logs.")

    if vector["level"] >= 4:
        anomalies.append("The log is marked as a serious or error-level event.")

    if vector["has_impersonator"] >= 1:
        anomalies.append("The activity may involve one user acting on behalf of another.")

    if vector["missing_data_score"] >= 2:
        anomalies.append("Several expected details are missing or incomplete.")
    elif vector["missing_data_score"] >= 1:
        anomalies.append("Some expected log details are missing.")

    if vector["login_without_session"] >= 1:
        anomalies.append("A login-related event appears without a session reference.")

    if vector["off_hours_activity"] >= 1:
        anomalies.append("The activity happened outside typical working hours.")

    if vector["weekend_activity"] >= 1:
        anomalies.append("Activity happened during the weekend.")

    if vector["linked_log_count"] >= 6 or vector["distinct_category_count"] >= 4:
        anomalies.append("The activity seems to spread across several related logs.")

    if movement_signal["movement"] == "increasing":
        anomalies.append("The nearby activity suggests the issue may be growing.")

    if float(anchor_group.get("average_risk", 0.0)) >= 5.0:
        anomalies.append("This log sits among other entries that also look risky.")

    if risk_score >= 9:
        anomalies.append("Overall, this looks like a high-priority issue.")
    elif risk_score >= 4:
        anomalies.append("Overall, this looks worth a closer look.")

    if prompt_matches:
        anomalies.append(
            "The analysis found patterns that match the user's question: "
            + ", ".join(prompt_matches[:4])
            + "."
        )

    return _unique_preserving_order(anomalies)


def _build_points_of_interest(
    context: AnalysisContext,
    model_result: ModelLayerResult,
    prompt_matches: list[str],
) -> list[str]:
    vector = model_result.anchor_row["vector"]
    anchor_group = model_result.anchor_group
    movement_signal = model_result.movement_signal

    points: list[str] = []

    if context.selected_logs:
        points.append(
            f"{len(context.selected_logs)} selected log(s) were included to give extra context."
        )

    if context.active_filter_labels:
        points.append(
            "The analysis respected these filters: " + ", ".join(context.active_filter_labels) + "."
        )

    if context.linked_logs:
        points.append(
            f"{len(context.linked_logs)} related log(s) were pulled in automatically because they share the same session, resource, or linked entities."
        )

    if prompt_matches:
        points.append(
            "These parts of the logs match the user's question: " + ", ".join(prompt_matches[:5]) + "."
        )

    if context.repeated_error_samples:
        points.append(
            "Repeated error examples: " + "; ".join(context.repeated_error_samples) + "."
        )

    dominant_categories = anchor_group.get("dominant_categories") or []
    if dominant_categories:
        points.append(
            "Most nearby entries fall into these categories: " + ", ".join(dominant_categories[:3]) + "."
        )

    if movement_signal["movement"] != "stable":
        points.append(
            f"The surrounding activity looks {movement_signal['movement']} rather than stable."
        )

    if vector["missing_data_score"] >= 1:
        points.append("Missing details influenced the final judgement.")

    return _unique_preserving_order(points)


def build_analysis_payload(
    context: AnalysisContext,
    model_result: ModelLayerResult,
) -> dict[str, Any]:
    prompt_matches = collect_prompt_matches(
        [context.anchor_log, *context.selected_logs, *context.linked_logs, *context.filtered_logs],
        context.user_prompt,
    )
    explanation_engine = get_explanation_engine()
    explanation_output = explanation_engine.generate(
        context,
        model_result,
        prompt_matches,
    )
    anomalies = _detect_anomalies(context, model_result, prompt_matches)
    points_of_interest = _build_points_of_interest(context, model_result, prompt_matches)

    priority_assessment = {
        **model_result.assessment_result,
        "heuristic_risk_score": int(model_result.anchor_row["risk_score"]),
    }

    context_overview = {
        "dataset": context.dataset,
        "requested_log_id": context.requested_log_id,
        "selected_log_count": len(context.selected_logs),
        "linked_log_count": len(context.linked_logs),
        "filtered_log_count": len(context.filtered_logs),
        "comparison_log_count": len(model_result.rows),
        "active_filters": context.active_filter_labels,
    }

    return {
        "summary": explanation_output.summary,
        "explanation": explanation_output.explanation,
        "anomalies": anomalies,
        "points_of_interest": points_of_interest,
        "related_resources": _build_related_resources(
            [context.anchor_log, *context.selected_logs, *context.linked_logs]
        ),
        "context_overview": context_overview,
        "feature_vector": model_result.anchor_row["vector"],
        "grouping_insight": model_result.anchor_group,
        "priority_assessment": priority_assessment,
        "activity_movement": model_result.movement_signal,
    }
