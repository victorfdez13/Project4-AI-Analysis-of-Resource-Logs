from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app import log_repository
from app.feature_engineering import (
    coerce_int,
    dedupe_logs,
    log_sort_key,
    normalize_level,
    normalize_text,
    parse_timestamp,
)


DEFAULT_CONTEXT_LIMIT = 80
MAX_CONTEXT_LIMIT = 200


@dataclass
class AnalysisContext:
    dataset: str | None
    requested_log_id: int | None
    user_prompt: str | None
    anchor_log: dict[str, Any]
    selected_logs: list[dict[str, Any]]
    linked_logs: list[dict[str, Any]]
    filtered_logs: list[dict[str, Any]]
    comparison_logs: list[dict[str, Any]]
    repeated_error_samples: list[str]
    active_filters: dict[str, Any]
    active_filter_labels: list[str]


def merge_log_data(base_log: dict[str, Any], overlay_log: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base_log)
    for key, value in overlay_log.items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


def _extract_dataset_hint(log_like: dict[str, Any]) -> str | None:
    dataset = (
        log_like.get("dataset")
        or log_like.get("datasetName")
        or log_like.get("dataset_name")
    )
    if not dataset:
        return None
    return str(dataset).upper()


def _extract_filters_dataset(active_filters: dict[str, Any]) -> str | None:
    dataset = active_filters.get("dataset") or active_filters.get("datasetName")
    if dataset:
        return str(dataset).upper()

    datasets = active_filters.get("datasets")
    if isinstance(datasets, list) and datasets:
        return str(datasets[0]).upper()

    return None


def _normalize_active_filters(active_filters: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(active_filters, dict):
        return {}
    return dict(active_filters)


def _resolve_limit(active_filters: dict[str, Any]) -> int:
    raw_limit = active_filters.get("limit") or active_filters.get("maxLogs")
    limit = coerce_int(raw_limit) or DEFAULT_CONTEXT_LIMIT
    return max(20, min(MAX_CONTEXT_LIMIT, limit))


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _extract_filter_log_ids(active_filters: dict[str, Any]) -> list[int]:
    values = _as_list(active_filters.get("logIds") or active_filters.get("log_ids"))
    return [
        value
        for value in (coerce_int(item) for item in values)
        if value is not None
    ]


def _hydrate_selected_logs(
    selected_logs_input: list[dict[str, Any]] | None,
    fallback_dataset: str | None,
) -> list[dict[str, Any]]:
    hydrated: list[dict[str, Any]] = []

    for item in selected_logs_input or []:
        if not isinstance(item, dict):
            continue

        if isinstance(item.get("log"), dict):
            log = dict(item["log"])
            dataset = _extract_dataset_hint(item) or fallback_dataset
            if dataset and not log.get("datasetName"):
                log["datasetName"] = dataset
            hydrated.append(log)
            continue

        if item.get("message") is not None or item.get("category") is not None:
            log = dict(item)
            dataset = _extract_dataset_hint(item) or fallback_dataset
            if dataset and not log.get("datasetName"):
                log["datasetName"] = dataset
            hydrated.append(log)
            continue

        dataset = _extract_dataset_hint(item) or fallback_dataset
        log_id = coerce_int(item.get("logId") or item.get("id"))
        if dataset and log_id is not None:
            fetched = log_repository.get_log(dataset, log_id)
            if fetched is not None:
                hydrated.append(fetched)

    return dedupe_logs(hydrated)


def _matches_filters(log: dict[str, Any], active_filters: dict[str, Any]) -> bool:
    if not active_filters:
        return True

    dataset_filters = {
        str(value).upper()
        for value in _as_list(active_filters.get("datasets") or active_filters.get("dataset"))
        if str(value).strip()
    }
    if dataset_filters:
        dataset_name = _extract_dataset_hint(log)
        if dataset_name not in dataset_filters:
            return False

    category_filters = {
        normalize_text(value)
        for value in _as_list(active_filters.get("categories") or active_filters.get("category"))
        if normalize_text(value)
    }
    if category_filters and normalize_text(log.get("category")) not in category_filters:
        return False

    level_filters = {
        normalize_level(value)
        for value in _as_list(active_filters.get("levels") or active_filters.get("level"))
        if value not in (None, "")
    }
    if level_filters and normalize_level(log.get("level")) not in level_filters:
        return False

    log_id_filters = {
        value
        for value in (
            coerce_int(item)
            for item in _as_list(active_filters.get("logIds") or active_filters.get("log_ids"))
        )
        if value is not None
    }
    current_log_id = coerce_int(log.get("logId"))
    if log_id_filters and current_log_id not in log_id_filters:
        return False

    search_terms = [
        normalize_text(value)
        for value in _as_list(
            active_filters.get("messageContains")
            or active_filters.get("message_contains")
            or active_filters.get("search")
            or active_filters.get("text")
        )
        if normalize_text(value)
    ]
    if search_terms:
        search_text = normalize_text(
            " ".join(
                [
                    str(log.get("message") or ""),
                    str(log.get("category") or ""),
                    str(log.get("mainEntityId") or ""),
                    str(log.get("sessionId") or ""),
                ]
            )
        )
        if not all(term in search_text for term in search_terms):
            return False

    session_filter = active_filters.get("sessionId") or active_filters.get("session_id")
    if session_filter and str(log.get("sessionId") or "") != str(session_filter):
        return False

    main_entity_filter = active_filters.get("mainEntityId") or active_filters.get("main_entity_id")
    if main_entity_filter and str(log.get("mainEntityId") or "") != str(main_entity_filter):
        return False

    impersonator_filter = active_filters.get("impersonatorMainEntityId") or active_filters.get(
        "impersonator_main_entity_id"
    )
    if impersonator_filter and str(log.get("impersonatorMainEntityId") or "") != str(
        impersonator_filter
    ):
        return False

    start_time = parse_timestamp(
        active_filters.get("fromTime")
        or active_filters.get("startTime")
        or active_filters.get("from")
    )
    if start_time is not None:
        log_time = parse_timestamp(log.get("time"))
        if log_time is None or log_time < start_time:
            return False

    end_time = parse_timestamp(
        active_filters.get("toTime")
        or active_filters.get("endTime")
        or active_filters.get("to")
    )
    if end_time is not None:
        log_time = parse_timestamp(log.get("time"))
        if log_time is None or log_time > end_time:
            return False

    if active_filters.get("onlyErrors") or active_filters.get("only_errors"):
        if normalize_level(log.get("level")) < 4:
            return False

    return True


def _summarize_filters(active_filters: dict[str, Any]) -> list[str]:
    labels: list[str] = []

    dataset = _extract_filters_dataset(active_filters)
    if dataset:
        labels.append(f"dataset={dataset}")

    categories = _as_list(active_filters.get("categories") or active_filters.get("category"))
    if categories:
        labels.append(
            "categories=" + ", ".join(str(category) for category in categories[:4])
        )

    levels = _as_list(active_filters.get("levels") or active_filters.get("level"))
    if levels:
        labels.append("levels=" + ", ".join(str(level) for level in levels[:4]))

    search_terms = _as_list(
        active_filters.get("messageContains")
        or active_filters.get("message_contains")
        or active_filters.get("search")
        or active_filters.get("text")
    )
    if search_terms:
        labels.append("text=" + ", ".join(str(term) for term in search_terms[:3]))

    session_id = active_filters.get("sessionId") or active_filters.get("session_id")
    if session_id:
        labels.append(f"sessionId={session_id}")

    main_entity_id = active_filters.get("mainEntityId") or active_filters.get("main_entity_id")
    if main_entity_id:
        labels.append(f"mainEntityId={main_entity_id}")

    if active_filters.get("onlyErrors") or active_filters.get("only_errors"):
        labels.append("onlyErrors=true")

    return labels


def _find_repeated_error_samples(logs: list[dict[str, Any]]) -> list[str]:
    message_counts: dict[str, int] = {}
    display_values: dict[str, str] = {}

    for log in logs:
        level = normalize_level(log.get("level"))
        message = normalize_text(log.get("message"))
        if level < 4 or not message:
            continue

        message_counts[message] = message_counts.get(message, 0) + 1
        display_values.setdefault(message, str(log.get("message") or ""))

    return [
        display_values[message][:90].strip()
        for message, count in message_counts.items()
        if count > 1
    ][:3]


def build_analysis_context(
    anchor_log: dict[str, Any],
    requested_log_id: int | None = None,
    user_prompt: str | None = None,
    selected_logs_input: list[dict[str, Any]] | None = None,
    active_filters_input: dict[str, Any] | None = None,
) -> AnalysisContext:
    if not isinstance(selected_logs_input, list):
        selected_logs_input = []

    active_filters = _normalize_active_filters(active_filters_input)
    dataset = (
        _extract_filters_dataset(active_filters)
        or _extract_dataset_hint(anchor_log)
        or (
            _extract_dataset_hint(selected_logs_input[0])
            if selected_logs_input and isinstance(selected_logs_input[0], dict)
            else None
        )
    )
    limit = _resolve_limit(active_filters)

    resolved_anchor = dict(anchor_log)
    if dataset and requested_log_id is not None:
        stored_anchor = log_repository.get_log(dataset, requested_log_id)
        if stored_anchor is not None:
            resolved_anchor = merge_log_data(stored_anchor, resolved_anchor)
    if dataset and not resolved_anchor.get("datasetName"):
        resolved_anchor["datasetName"] = dataset

    selected_logs = _hydrate_selected_logs(selected_logs_input, dataset)
    linked_logs = (
        log_repository.get_related_logs(dataset, resolved_anchor, limit=min(24, limit))
        if dataset
        else []
    )
    filter_log_ids = _extract_filter_log_ids(active_filters)
    filter_id_logs = (
        log_repository.get_logs_by_ids(dataset, filter_log_ids)
        if dataset and filter_log_ids
        else []
    )
    recent_logs = log_repository.get_recent_logs(dataset, limit=limit) if dataset else []

    candidate_logs = dedupe_logs(
        [resolved_anchor, *selected_logs, *linked_logs, *filter_id_logs, *recent_logs]
    )
    candidate_logs.sort(key=log_sort_key, reverse=True)

    filtered_logs = [log for log in candidate_logs if _matches_filters(log, active_filters)]
    filtered_logs = filtered_logs[:limit]

    comparison_logs = dedupe_logs([resolved_anchor, *selected_logs, *linked_logs, *filtered_logs])
    comparison_logs.sort(key=log_sort_key)

    return AnalysisContext(
        dataset=dataset,
        requested_log_id=requested_log_id,
        user_prompt=user_prompt,
        anchor_log=resolved_anchor,
        selected_logs=selected_logs,
        linked_logs=linked_logs,
        filtered_logs=filtered_logs,
        comparison_logs=comparison_logs,
        repeated_error_samples=_find_repeated_error_samples(
            [resolved_anchor, *linked_logs, *filtered_logs]
        ),
        active_filters=active_filters,
        active_filter_labels=_summarize_filters(active_filters),
    )
