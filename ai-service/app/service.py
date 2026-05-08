"""Rule-based analyzer for real SpeedAdmin logs.

The algorithm is intentionally simple and deterministic:
- no LLM call,
- no API key required,
- only uses the real fields stored in MongoDB.
"""

from typing import Any

from app.models import AnalyzeRequest, AnalyzeResponse


_LOGIN_CATEGORIES = {"loginsystem", "login", "authentication"}


def _truncate(text: str, max_len: int = 160) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _build_summary(log: dict[str, Any]) -> str:
    dataset = log.get("datasetName") or "UNKNOWN"
    log_id = log.get("logId")
    category = log.get("category") or "UnknownCategory"
    message = log.get("message") or "(no message)"
    return (
        f"Log {log_id} from {dataset} belongs to category "
        f"{category} and reports: {_truncate(str(message))}"
    )


def _build_explanation(log: dict[str, Any]) -> str:
    category = log.get("category") or "UnknownCategory"
    level = log.get("level")
    main_entity = log.get("mainEntityId")
    impersonator = log.get("impersonatorMainEntityId")
    entities = log.get("entities") or []
    changes = log.get("changes") or []
    message = (log.get("message") or "").strip()

    parts: list[str] = []
    parts.append(
        f"Event in category '{category}' at level {level if level is not None else 'unknown'}."
    )

    if message:
        parts.append(f"Message: {_truncate(message, 200)}")

    if main_entity is not None:
        parts.append(f"Performed by main entity {main_entity}.")

    if impersonator is not None:
        parts.append(
            f"Action was performed via impersonation by entity {impersonator}."
        )

    if changes:
        parts.append(f"{len(changes)} field change(s) recorded.")

    if entities:
        parts.append(f"{len(entities)} related entity reference(s).")

    return " ".join(parts)


def _detect_anomalies(log: dict[str, Any]) -> list[str]:
    anomalies: list[str] = []

    impersonator = log.get("impersonatorMainEntityId")
    if impersonator is not None:
        anomalies.append(
            f"Impersonation detected (impersonatorMainEntityId={impersonator})."
        )

    changes = log.get("changes") or []
    if len(changes) > 0:
        anomalies.append(f"Log contains {len(changes)} change record(s).")

    level = log.get("level")
    if level is not None and level != 2:
        anomalies.append(f"Unusual log level: {level} (expected 2).")

    message = log.get("message")
    if message is None or str(message).strip() == "":
        anomalies.append("Empty log message.")

    category = (log.get("category") or "").lower()
    session_id = log.get("sessionId")
    if category in _LOGIN_CATEGORIES and not session_id:
        anomalies.append(
            "Login-related category but no sessionId is attached."
        )

    entities = log.get("entities") or []
    main_entity = log.get("mainEntityId")
    if main_entity is not None and len(entities) == 0:
        anomalies.append(
            "Log has a main entity but no related entities listed."
        )

    return anomalies


def _build_related_resources(log: dict[str, Any]) -> list[str]:
    related: list[str] = []

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

    return related


def analyze_speedadmin_log(log: dict[str, Any]) -> dict[str, Any]:
    """Run the rule-based algorithm on a real SpeedAdmin log dict."""
    return {
        "summary": _build_summary(log),
        "explanation": _build_explanation(log),
        "anomalies": _detect_anomalies(log),
        "related_resources": _build_related_resources(log),
    }


def _build_log_from_request(request: AnalyzeRequest) -> dict[str, Any]:
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
    log = _build_log_from_request(request)
    result = analyze_speedadmin_log(log)
    return AnalyzeResponse(**result)
