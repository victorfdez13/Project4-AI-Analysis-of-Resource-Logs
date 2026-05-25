import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any


_LOGIN_CATEGORIES = {"loginsystem", "login", "authentication"}
_LEVEL_NAME_MAP = {
    "trace": 0,
    "debug": 1,
    "info": 2,
    "information": 2,
    "warn": 3,
    "warning": 3,
    "error": 4,
    "critical": 5,
    "fatal": 5,
}
_PROMPT_STOPWORDS = {
    "about",
    "after",
    "before",
    "could",
    "explain",
    "fetch",
    "from",
    "include",
    "into",
    "just",
    "logs",
    "look",
    "maybe",
    "please",
    "show",
    "that",
    "them",
    "these",
    "those",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
}
_ERROR_TERMS = ("error", "failed", "failure", "exception", "critical")

FEATURE_ORDER = [
    "level",
    "has_impersonator",
    "change_count",
    "entity_count",
    "linked_log_count",
    "warning_ratio",
    "error_ratio",
    "repeated_message_count",
    "repeated_error_count",
    "distinct_category_count",
    "category_frequency",
    "session_present",
    "main_entity_present",
    "login_category",
    "login_without_session",
    "missing_data_score",
    "empty_message",
    "off_hours_activity",
    "weekend_activity",
    "activity_span_minutes",
    "prompt_match_score",
]


def coerce_int(value: Any) -> int | None:
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


def normalize_level(value: Any) -> int:
    numeric = coerce_int(value)
    if numeric is not None:
        return numeric

    text = str(value or "").strip().lower()
    if not text:
        return 0

    digits = re.findall(r"\d+", text)
    if digits:
        return int(digits[0])

    for level_name, mapped_value in _LEVEL_NAME_MAP.items():
        if level_name in text:
            return mapped_value

    return 0


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def parse_timestamp(value: Any) -> datetime | None:
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


def log_sort_key(log: dict[str, Any]) -> tuple[datetime, int]:
    timestamp = parse_timestamp(log.get("time")) or datetime.min.replace(
        tzinfo=timezone.utc
    )
    log_id = coerce_int(log.get("logId")) or -1
    return (timestamp, log_id)


def stable_log_key(log: dict[str, Any]) -> tuple[str, str]:
    dataset = str(log.get("datasetName") or "UNKNOWN")
    log_id = log.get("logId")
    if log_id is not None:
        return (dataset, str(log_id))
    return (dataset, f"adhoc:{id(log)}")


def dedupe_logs(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []

    for log in logs:
        key = stable_log_key(log)
        if key in seen:
            continue
        seen.add(key)
        result.append(log)

    return result


def extract_prompt_terms(prompt: str | None) -> set[str]:
    if not prompt:
        return set()

    tokens = re.findall(r"[a-z0-9_-]+", prompt.lower())
    return {
        token
        for token in tokens
        if len(token) >= 3 and token not in _PROMPT_STOPWORDS
    }


def build_log_search_text(log: dict[str, Any]) -> str:
    parts: list[str] = [
        str(log.get("category") or ""),
        str(log.get("message") or ""),
        str(log.get("sessionId") or ""),
        str(log.get("mainEntityId") or ""),
        str(log.get("impersonatorMainEntityId") or ""),
    ]

    for entity in log.get("entities") or []:
        if not isinstance(entity, dict):
            continue
        parts.append(str(entity.get("entityType") or ""))
        parts.append(str(entity.get("entityId") or ""))

    for change in log.get("changes") or []:
        if not isinstance(change, dict):
            continue
        parts.append(str(change.get("propertyName") or ""))
        parts.append(str(change.get("message") or ""))
        parts.append(str(change.get("previousValue") or ""))
        parts.append(str(change.get("newValue") or ""))

    return normalize_text(" ".join(parts))


def collect_prompt_matches(
    logs: list[dict[str, Any]],
    prompt: str | None,
    max_matches: int = 6,
) -> list[str]:
    prompt_terms = extract_prompt_terms(prompt)
    if not prompt_terms:
        return []

    search_text = " ".join(build_log_search_text(log) for log in logs)
    matches = [term for term in sorted(prompt_terms) if term in search_text]
    return matches[:max_matches]


def _extract_entity_keys(log: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for entity in log.get("entities") or []:
        if not isinstance(entity, dict):
            continue
        entity_type = str(entity.get("entityType") or "").strip()
        entity_id = str(entity.get("entityId") or "").strip()
        if entity_type and entity_id:
            keys.add(f"{entity_type}:{entity_id}")
        elif entity_id:
            keys.add(entity_id)
    return keys


def find_local_links(
    anchor_log: dict[str, Any],
    candidate_logs: list[dict[str, Any]],
    limit: int = 12,
) -> list[dict[str, Any]]:
    anchor_key = stable_log_key(anchor_log)
    anchor_entities = _extract_entity_keys(anchor_log)
    anchor_category = normalize_text(anchor_log.get("category"))

    scored: list[tuple[int, dict[str, Any]]] = []
    for candidate in candidate_logs:
        if stable_log_key(candidate) == anchor_key:
            continue

        score = 0

        if anchor_log.get("sessionId") and anchor_log.get("sessionId") == candidate.get(
            "sessionId"
        ):
            score += 3

        if anchor_log.get("mainEntityId") and anchor_log.get("mainEntityId") == candidate.get(
            "mainEntityId"
        ):
            score += 2

        if anchor_log.get("impersonatorMainEntityId") and anchor_log.get(
            "impersonatorMainEntityId"
        ) == candidate.get("impersonatorMainEntityId"):
            score += 2

        overlap = anchor_entities.intersection(_extract_entity_keys(candidate))
        if overlap:
            score += 2 + min(2, len(overlap))

        candidate_category = normalize_text(candidate.get("category"))
        if anchor_category and anchor_category == candidate_category:
            score += 1

        if score > 0:
            scored.append((score, candidate))

    scored.sort(key=lambda item: (item[0], log_sort_key(item[1])), reverse=True)
    return [candidate for _, candidate in scored[: max(1, limit)]]


def _count_repeated_messages(context_logs: list[dict[str, Any]]) -> int:
    message_counter: Counter[str] = Counter()
    for item in context_logs:
        message = normalize_text(item.get("message"))
        if message:
            message_counter[message] += 1
    return sum(1 for count in message_counter.values() if count > 1)


def _count_repeated_errors(context_logs: list[dict[str, Any]]) -> int:
    error_counter: Counter[str] = Counter()

    for item in context_logs:
        message = normalize_text(item.get("message"))
        if not message:
            continue

        level = normalize_level(item.get("level"))
        if level >= 4 or any(term in message for term in _ERROR_TERMS):
            error_counter[message] += 1

    return sum(1 for count in error_counter.values() if count > 1)


def _calculate_missing_data_score(log: dict[str, Any], login_category: bool) -> float:
    score = 0.0

    if not str(log.get("category") or "").strip():
        score += 1.0
    if not str(log.get("message") or "").strip():
        score += 1.0
    if log.get("time") in (None, ""):
        score += 1.0
    if login_category and not log.get("sessionId"):
        score += 1.0
    if log.get("mainEntityId") is not None and len(log.get("entities") or []) == 0:
        score += 1.0

    return score


def build_feature_vector(
    log: dict[str, Any],
    linked_logs: list[dict[str, Any]],
    user_prompt: str | None = None,
) -> dict[str, float]:
    context_logs = [log, *linked_logs]
    levels = [normalize_level(item.get("level")) for item in context_logs]
    total_logs = max(1, len(context_logs))

    warning_count = sum(1 for level in levels if level >= 3)
    error_count = sum(1 for level in levels if level >= 4)

    category = normalize_text(log.get("category"))
    categories = [
        normalize_text(item.get("category"))
        for item in context_logs
        if normalize_text(item.get("category"))
    ]
    category_frequency = (
        sum(1 for item in categories if item == category) / total_logs if category else 0.0
    )

    repeated_message_count = _count_repeated_messages(context_logs)
    repeated_error_count = _count_repeated_errors(context_logs)

    timestamps = [parse_timestamp(item.get("time")) for item in context_logs]
    timestamps = [timestamp for timestamp in timestamps if timestamp is not None]
    activity_span_minutes = 0.0
    if len(timestamps) >= 2:
        span_seconds = (max(timestamps) - min(timestamps)).total_seconds()
        activity_span_minutes = max(1.0, round(span_seconds / 60.0, 2))

    anchor_timestamp = parse_timestamp(log.get("time"))
    off_hours_activity = 0.0
    weekend_activity = 0.0
    if anchor_timestamp is not None:
        off_hours_activity = 1.0 if anchor_timestamp.hour < 6 or anchor_timestamp.hour >= 22 else 0.0
        weekend_activity = 1.0 if anchor_timestamp.weekday() >= 5 else 0.0

    login_category = category in _LOGIN_CATEGORIES
    session_present = 1.0 if log.get("sessionId") else 0.0
    missing_data_score = _calculate_missing_data_score(log, login_category)
    prompt_match_score = float(len(collect_prompt_matches(context_logs, user_prompt)))

    return {
        "level": float(normalize_level(log.get("level"))),
        "has_impersonator": 1.0 if log.get("impersonatorMainEntityId") is not None else 0.0,
        "change_count": float(len(log.get("changes") or [])),
        "entity_count": float(len(log.get("entities") or [])),
        "linked_log_count": float(len(linked_logs)),
        "warning_ratio": round(warning_count / total_logs, 3),
        "error_ratio": round(error_count / total_logs, 3),
        "repeated_message_count": float(repeated_message_count),
        "repeated_error_count": float(repeated_error_count),
        "distinct_category_count": float(len(set(categories))),
        "category_frequency": round(category_frequency, 3),
        "session_present": session_present,
        "main_entity_present": 1.0 if log.get("mainEntityId") is not None else 0.0,
        "login_category": 1.0 if login_category else 0.0,
        "login_without_session": 1.0 if login_category and not session_present else 0.0,
        "missing_data_score": float(missing_data_score),
        "empty_message": 1.0 if not str(log.get("message") or "").strip() else 0.0,
        "off_hours_activity": off_hours_activity,
        "weekend_activity": weekend_activity,
        "activity_span_minutes": float(activity_span_minutes),
        "prompt_match_score": prompt_match_score,
    }


def vector_as_list(vector: dict[str, float]) -> list[float]:
    return [float(vector[name]) for name in FEATURE_ORDER]


def heuristic_risk_score(vector: dict[str, float]) -> int:
    score = 0

    level = vector["level"]
    if level >= 4:
        score += 4
    elif level >= 3:
        score += 2

    if vector["has_impersonator"] >= 1:
        score += 3

    if vector["change_count"] >= 5:
        score += 2
    elif vector["change_count"] >= 2:
        score += 1

    if vector["linked_log_count"] >= 6:
        score += 2
    elif vector["linked_log_count"] >= 3:
        score += 1

    if vector["error_ratio"] >= 0.4:
        score += 2
    elif vector["warning_ratio"] >= 0.5:
        score += 1

    if vector["repeated_message_count"] >= 2:
        score += 1

    if vector["repeated_error_count"] >= 1:
        score += 2

    if vector["login_without_session"] >= 1:
        score += 2

    if vector["missing_data_score"] >= 2:
        score += 2
    elif vector["missing_data_score"] >= 1:
        score += 1

    if vector["off_hours_activity"] >= 1:
        score += 1

    if vector["weekend_activity"] >= 1:
        score += 1

    if vector["activity_span_minutes"] >= 240:
        score += 2
    elif vector["activity_span_minutes"] >= 120:
        score += 1

    return score


def risk_label_from_score(score: int) -> str:
    if score >= 9:
        return "critical"
    if score >= 4:
        return "watch"
    return "normal"


def build_feature_rows(
    logs: list[dict[str, Any]],
    user_prompt: str | None = None,
) -> list[dict[str, Any]]:
    unique_logs = dedupe_logs(logs)
    unique_logs.sort(key=log_sort_key)

    rows: list[dict[str, Any]] = []
    for log in unique_logs:
        linked_logs = find_local_links(log, unique_logs)
        vector = build_feature_vector(log, linked_logs, user_prompt=user_prompt)
        risk_score = heuristic_risk_score(vector)
        rows.append(
            {
                "log": log,
                "linked_logs": linked_logs,
                "vector": vector,
                "risk_score": risk_score,
                "risk_label": risk_label_from_score(risk_score),
            }
        )

    return rows
