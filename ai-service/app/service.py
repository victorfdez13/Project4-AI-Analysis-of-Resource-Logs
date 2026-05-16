"""Rule-based analyzer for real SpeedAdmin logs.

The service stays model-agnostic at the API boundary while the Python
implementation builds a richer multi-log context when a dataset/logId pair
is available.
"""

import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app import llm
from app.models import AnalyzeRequest, AnalyzeResponse


_LOGIN_CATEGORIES = {"loginsystem", "login", "authentication"}
_DEFAULT_INFO_LEVEL = 2
_MAX_CATEGORY_NAMES = 3
_MAX_MESSAGE_SAMPLE = 80
_MAX_RELATED_RESOURCES = 24


def _truncate(text: str, max_len: int = 160) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)

    text = str(value).strip()
    if not text:
        return None

    try:
        return int(text)
    except ValueError:
        return None


def _parse_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return (
            value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        )

    text = str(value).strip()
    if not text:
        return None

    try:
        normalized = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return (
            parsed
            if parsed.tzinfo is not None
            else parsed.replace(tzinfo=timezone.utc)
        )
    except ValueError:
        return None


def _unique_preserving_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)

    return ordered


def _format_categories(categories: Counter[str]) -> str:
    if not categories:
        return "unknown categories"

    names = [name for name, _ in categories.most_common(_MAX_CATEGORY_NAMES)]
    if len(categories) > _MAX_CATEGORY_NAMES:
        names.append("other categories")
    return ", ".join(names)


def _log_sort_key(log: dict[str, Any]) -> tuple[datetime, int]:
    timestamp = _parse_timestamp(log.get("time")) or datetime.min.replace(
        tzinfo=timezone.utc
    )
    log_id = _coerce_int(log.get("logId")) or -1
    return (timestamp, log_id)


def _dedupe_logs(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []

    for log in logs:
        dataset = str(log.get("datasetName") or "UNKNOWN")
        log_id = str(log.get("logId") or "")
        key = (dataset, log_id)
        if key in seen:
            continue

        seen.add(key)
        result.append(log)

    return result


def _extract_repeated_messages(
    logs: list[dict[str, Any]],
) -> list[tuple[str, int]]:
    counts: Counter[str] = Counter()
    samples: dict[str, str] = {}

    for log in logs:
        message = str(log.get("message") or "").strip()
        if not message:
            continue

        normalized = " ".join(message.lower().split())
        counts[normalized] += 1
        samples.setdefault(normalized, message)

    repeated = [
        (_truncate(samples[key], _MAX_MESSAGE_SAMPLE), count)
        for key, count in counts.items()
        if count > 1
    ]
    repeated.sort(key=lambda item: (-item[1], item[0]))
    return repeated


def _collect_changed_properties(logs: list[dict[str, Any]]) -> Counter[str]:
    changed_properties: Counter[str] = Counter()

    for log in logs:
        for change in log.get("changes") or []:
            if not isinstance(change, dict):
                continue

            property_name = str(change.get("propertyName") or "").strip()
            if property_name:
                changed_properties[property_name] += 1

    return changed_properties


def _describe_context(logs: list[dict[str, Any]]) -> dict[str, Any]:
    category_counts: Counter[str] = Counter()
    main_entity_counts: Counter[str] = Counter()
    warning_or_higher = 0
    error_or_higher = 0
    timestamps: list[datetime] = []

    for log in logs:
        category = str(log.get("category") or "UnknownCategory")
        category_counts[category] += 1

        main_entity = str(log.get("mainEntityId") or "").strip()
        if main_entity:
            main_entity_counts[main_entity] += 1

        level = _coerce_int(log.get("level"))
        if level is not None and level >= 3:
            warning_or_higher += 1
        if level is not None and level >= 4:
            error_or_higher += 1

        timestamp = _parse_timestamp(log.get("time"))
        if timestamp is not None:
            timestamps.append(timestamp)

    repeated_messages = _extract_repeated_messages(logs)
    changed_properties = _collect_changed_properties(logs)
    span_minutes = None
    if len(timestamps) >= 2:
        span = max(timestamps) - min(timestamps)
        span_minutes = max(1, int(span.total_seconds() // 60))

    return {
        "category_counts": category_counts,
        "main_entity_counts": main_entity_counts,
        "warning_or_higher": warning_or_higher,
        "error_or_higher": error_or_higher,
        "repeated_messages": repeated_messages,
        "changed_properties": changed_properties,
        "span_minutes": span_minutes,
    }


def _build_points_of_interest(
    anchor_log: dict[str, Any],
    linked_logs: list[dict[str, Any]],
    context: dict[str, Any],
) -> list[str]:
    points: list[str] = []

    if linked_logs:
        points.append(
            f"{len(linked_logs)} linked log(s) were included through shared session or entity references."
        )

    category_counts: Counter[str] = context["category_counts"]
    if category_counts:
        top_category, top_count = category_counts.most_common(1)[0]
        if top_count > 1:
            points.append(
                f"Category '{top_category}' appears {top_count} time(s) in the analysis context."
            )

    repeated_messages: list[tuple[str, int]] = context["repeated_messages"]
    if repeated_messages:
        sample, count = repeated_messages[0]
        points.append(
            f"Repeated message pattern detected {count} time(s): '{sample}'."
        )

    changed_properties: Counter[str] = context["changed_properties"]
    if changed_properties:
        top_properties = ", ".join(
            name for name, _ in changed_properties.most_common(3)
        )
        points.append(f"Most affected field(s): {top_properties}.")

    if context["warning_or_higher"] > 0:
        points.append(
            f"{context['warning_or_higher']} log(s) in context are warning level or higher."
        )

    if context["span_minutes"] is not None and len(linked_logs) > 0:
        points.append(
            f"Linked activity spans roughly {context['span_minutes']} minute(s)."
        )

    anchor_entities = anchor_log.get("entities") or []
    if anchor_entities:
        points.append(
            f"Anchor log references {len(anchor_entities)} related resource(s)."
        )

    return points


def _detect_anchor_anomalies(log: dict[str, Any]) -> list[str]:
    anomalies: list[str] = []

    impersonator = log.get("impersonatorMainEntityId")
    if impersonator is not None:
        anomalies.append(
            f"Impersonation detected (impersonatorMainEntityId={impersonator})."
        )

    changes = log.get("changes") or []
    if len(changes) > 0:
        anomalies.append(f"Log contains {len(changes)} change record(s).")

    level = _coerce_int(log.get("level"))
    if level is not None and level != _DEFAULT_INFO_LEVEL:
        anomalies.append(
            f"Unusual log level: {level} (expected {_DEFAULT_INFO_LEVEL})."
        )

    message = log.get("message")
    if message is None or str(message).strip() == "":
        anomalies.append("Empty log message.")

    category = str(log.get("category") or "").lower()
    session_id = log.get("sessionId")
    if category in _LOGIN_CATEGORIES and not session_id:
        anomalies.append("Login-related category but no sessionId is attached.")

    entities = log.get("entities") or []
    main_entity = log.get("mainEntityId")
    if main_entity is not None and len(entities) == 0:
        anomalies.append("Log has a main entity but no related entities listed.")

    return anomalies


def _detect_context_anomalies(
    logs: list[dict[str, Any]],
    context: dict[str, Any],
) -> list[str]:
    anomalies: list[str] = []

    linked_log_count = max(0, len(logs) - 1)
    if linked_log_count >= 5:
        anomalies.append(
            f"High linked activity cluster detected ({linked_log_count} related logs)."
        )

    repeated_messages: list[tuple[str, int]] = context["repeated_messages"]
    if repeated_messages:
        sample, count = repeated_messages[0]
        if count >= 3:
            anomalies.append(
                f"Repeated message pattern detected ({count} occurrences): '{sample}'."
            )

    if context["error_or_higher"] >= 2:
        anomalies.append(
            f"Linked context contains {context['error_or_higher']} error/critical log(s)."
        )

    if len(context["main_entity_counts"]) >= 3:
        anomalies.append(
            "Linked context spans several main entities, which may indicate cross-resource impact."
        )

    return anomalies


def _build_summary(
    anchor_log: dict[str, Any],
    linked_logs: list[dict[str, Any]],
    context: dict[str, Any],
    anomalies: list[str],
    user_query: str | None,
) -> str:
    dataset = anchor_log.get("datasetName") or "UNKNOWN"
    log_id = anchor_log.get("logId")
    category = anchor_log.get("category") or "UnknownCategory"
    category_summary = _format_categories(context["category_counts"])

    summary = (
        f"Log {log_id} from {dataset} in category {category} "
        f"was analysed with {len(linked_logs)} linked log(s) across {category_summary}."
    )

    if context["error_or_higher"] > 0:
        summary += (
            f" {context['error_or_higher']} error/critical event(s) appear in the context."
        )
    elif anomalies:
        summary += f" {len(anomalies)} notable anomaly signal(s) were found."
    else:
        summary += " No strong anomaly signal was found in the available context."

    if user_query:
        summary += f" Prompt focus: {_truncate(user_query, 80)}."

    return summary


def _build_explanation(
    anchor_log: dict[str, Any],
    linked_logs: list[dict[str, Any]],
    context: dict[str, Any],
    points_of_interest: list[str],
    user_query: str | None,
) -> str:
    category = anchor_log.get("category") or "UnknownCategory"
    level = _coerce_int(anchor_log.get("level"))
    message = str(anchor_log.get("message") or "").strip()

    parts: list[str] = [
        f"Anchor event: category '{category}' at level {level if level is not None else 'unknown'}."
    ]

    if message:
        parts.append(f"Message: {_truncate(message, 200)}")

    main_entity = anchor_log.get("mainEntityId")
    if main_entity is not None:
        parts.append(f"Primary resource: {main_entity}.")

    if user_query:
        parts.append(f"User focus: {_truncate(user_query, 120)}.")

    if linked_logs:
        parts.append(
            f"Context enrichment added {len(linked_logs)} linked log(s) using shared session/entity references."
        )

    if context["span_minutes"] is not None and linked_logs:
        parts.append(
            f"The related activity spans approximately {context['span_minutes']} minute(s)."
        )

    if points_of_interest:
        parts.append(
            "Points of interest: " + " ".join(points_of_interest[:4])
        )

    return " ".join(parts)


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

    return _unique_preserving_order(related)[:_MAX_RELATED_RESOURCES]


def _llm_describe(
    anchor_log: dict[str, Any],
    context: dict[str, Any],
    anomalies: list[str],
    user_query: str | None,
) -> dict[str, str]:
    """Ask the LLM for summary + explanation. Returns {} on failure."""
    category = anchor_log.get("category") or "UnknownCategory"
    level = _coerce_int(anchor_log.get("level"))
    message = str(anchor_log.get("message") or "").strip()
    timestamp = str(anchor_log.get("time") or "")

    changes = anchor_log.get("changes") or []
    changes_text = (
        ", ".join(
            str(c.get("propertyName", "")) for c in changes[:5] if isinstance(c, dict)
        )
        or "none"
    )

    entities = anchor_log.get("entities") or []
    entity_types_text = (
        ", ".join(
            str(e.get("entityType", "")) for e in entities[:5] if isinstance(e, dict)
        )
        or "none"
    )

    top_categories = ", ".join(
        name for name, _ in context["category_counts"].most_common(3)
    ) or "none"
    warning_count = context["warning_or_higher"]
    anomaly_list = "; ".join(anomalies) if anomalies else "none"
    span = context["span_minutes"]
    n_logs = sum(context["category_counts"].values())

    user_section = f"\n  User question: {user_query}" if user_query else ""

    prompt = f"""You are analyzing a SpeedAdmin school-management log entry.

Log:
  Category: {category}
  Level: {level}
  Message: {message}
  Time: {timestamp}
  Changed fields: {changes_text}
  Entity types: {entity_types_text}

Context ({n_logs} related logs{f' over {span} minutes' if span else ''}):
  Top categories: {top_categories}
  Warnings/errors in context: {warning_count}
  Detected anomalies: {anomaly_list}{user_section}

Return JSON only, no markdown:
{{"summary": "<one sentence>", "explanation": "<2-4 sentences>"}}"""

    raw = llm.complete(prompt)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass
    return {}


def analyze_speedadmin_log(
    log: dict[str, Any],
    linked_logs: list[dict[str, Any]] | None = None,
    user_query: str | None = None,
) -> dict[str, Any]:
    """Run a deterministic multi-log analysis on a SpeedAdmin log dict."""
    anchor_log = dict(log)
    context_logs = _dedupe_logs([anchor_log, *(linked_logs or [])])
    context_logs.sort(key=_log_sort_key)
    linked_context = [
        context_log
        for context_log in context_logs
        if context_log.get("logId") != anchor_log.get("logId")
    ]

    context = _describe_context(context_logs)
    points_of_interest = _build_points_of_interest(
        anchor_log, linked_context, context
    )
    anomalies = _unique_preserving_order(
        _detect_anchor_anomalies(anchor_log)
        + _detect_context_anomalies(context_logs, context)
    )

    llm_out = _llm_describe(anchor_log, context, anomalies, user_query)
    summary = llm_out.get("summary") or _build_summary(
        anchor_log, linked_context, context, anomalies, user_query
    )
    explanation = llm_out.get("explanation") or _build_explanation(
        anchor_log, linked_context, context, points_of_interest, user_query
    )

    return {
        "summary": summary,
        "explanation": explanation,
        "anomalies": anomalies,
        "related_resources": _build_related_resources(context_logs),
    }


def build_log_from_request(request: AnalyzeRequest) -> dict[str, Any]:
    """Translate a legacy AnalyzeRequest into a SpeedAdmin-shaped dict."""
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


def analyze_log(request: AnalyzeRequest) -> AnalyzeResponse:
    """Backwards-compatible entrypoint used by POST /analyze."""
    metadata = request.metadata or {}
    log = build_log_from_request(request)
    user_query = (
        metadata.get("query")
        or metadata.get("prompt")
        or metadata.get("userPrompt")
    )
    result = analyze_speedadmin_log(log, user_query=user_query)
    return AnalyzeResponse(**result)
