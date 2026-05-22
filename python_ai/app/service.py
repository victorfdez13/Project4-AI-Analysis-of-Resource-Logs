from typing import Any

from app.analysis_layer import build_analysis_payload
from app.context_layer import build_analysis_context
from app.model_layer import run_model_layer, study_model_layer
from app.models import AnalyzeRequest


def analyze_speedadmin_log(
    log: dict[str, Any],
    requested_log_id: int | None = None,
    user_prompt: str | None = None,
    selected_logs_input: list[dict[str, Any]] | None = None,
    active_filters_input: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = build_analysis_context(
        anchor_log=log,
        requested_log_id=requested_log_id,
        user_prompt=user_prompt,
        selected_logs_input=selected_logs_input,
        active_filters_input=active_filters_input,
    )
    model_result = run_model_layer(context)
    return build_analysis_payload(context, model_result)


def study_dataset(dataset: str, logs: list[dict[str, Any]]) -> dict[str, Any]:
    return study_model_layer(dataset, logs)


def build_log_from_request(request: AnalyzeRequest) -> dict[str, Any]:
    metadata = request.metadata or {}
    return {
        "datasetName": metadata.get("dataset") or metadata.get("datasetName"),
        "logId": metadata.get("logId"),
        "category": metadata.get("category"),
        "time": request.timestamp,
        "message": request.log_text,
        "mainEntityId": metadata.get("mainEntityId"),
        "impersonatorMainEntityId": metadata.get("impersonatorMainEntityId"),
        "sessionId": metadata.get("sessionId"),
        "level": metadata.get("level"),
        "changes": metadata.get("changes") or [],
        "entities": metadata.get("entities") or [],
    }


def extract_request_options(request: AnalyzeRequest) -> dict[str, Any]:
    metadata = request.metadata or {}

    raw_log_id = metadata.get("logId")
    requested_log_id: int | None = None
    if raw_log_id is not None:
        try:
            requested_log_id = int(raw_log_id)
        except (TypeError, ValueError):
            requested_log_id = None

    selected_logs = (
        request.selected_logs
        or metadata.get("selectedLogs")
        or metadata.get("selected_logs")
        or []
    )
    if not isinstance(selected_logs, list):
        selected_logs = [selected_logs] if isinstance(selected_logs, dict) else []

    active_filters = (
        request.active_filters
        or metadata.get("activeFilters")
        or metadata.get("active_filters")
        or metadata.get("filters")
        or {}
    )
    if not isinstance(active_filters, dict):
        active_filters = {}

    user_prompt = (
        request.user_prompt
        or metadata.get("query")
        or metadata.get("prompt")
        or metadata.get("userPrompt")
        or request.prompt
    )

    return {
        "requested_log_id": requested_log_id,
        "selected_logs": selected_logs,
        "active_filters": active_filters,
        "user_prompt": str(user_prompt).strip() if user_prompt else None,
    }
