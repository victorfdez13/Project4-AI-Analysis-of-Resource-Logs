import json
from typing import Any

from app import llm
from app.models import AnalyzeRequest


def analyze_speedadmin_log(
    log: dict[str, Any],
    linked_logs: list[dict[str, Any]] | None = None,
    user_query: str | None = None,
) -> dict[str, Any]:
    category = log.get("category") or "Unknown"
    level = log.get("level")
    message = str(log.get("message") or "").strip()
    timestamp = str(log.get("time") or "")
    changes = log.get("changes") or []
    entities = log.get("entities") or []
    impersonator = log.get("impersonatorMainEntityId")
    session_id = log.get("sessionId")
    linked = linked_logs or []

    changes_text = ", ".join(
        str(c.get("propertyName", "")) for c in changes[:5] if isinstance(c, dict)
    ) or "none"

    entity_types = ", ".join(
        str(e.get("entityType", "")) for e in entities[:5] if isinstance(e, dict)
    ) or "none"

    linked_summary = (
        f"{len(linked)} related log(s) sharing the same session or entity"
        if linked else "no linked logs"
    )
    impersonation = f"yes — acting user id {impersonator}" if impersonator else "none"
    user_section = f"\nUser question: {user_query}" if user_query else ""

    prompt = f"""You are analyzing a SpeedAdmin school-management system log entry.
Write for non-technical school staff — avoid jargon, be clear and concise.

Log details:
  Category: {category}
  Severity level: {level} (2=info, 3=warning, 4=error, 5=critical)
  Message: {message}
  Timestamp: {timestamp}
  Fields changed: {changes_text}
  Resource types involved: {entity_types}
  Context: {linked_summary}
  Impersonation: {impersonation}{user_section}

Return valid JSON only — no markdown, no code fences:
{{
  "summary": "<one sentence in plain language: what happened and why it matters>",
  "explanation": "<2-4 sentences explaining the event in non-technical terms, what caused it and what to watch for>",
  "anomalies": ["<any unusual or suspicious aspect — empty list if none>"],
  "points_of_interest": ["<notable contextual observation, cross-resource link, or pattern — empty list if none>"],
  "related_resources": ["<correlated entity or session reference, e.g. entity:Teacher:42 or session:abc123>"]
}}"""

    raw = llm.complete(prompt)
    if raw:
        cleaned = raw.strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                parsed = json.loads(cleaned[start:end])
                if isinstance(parsed, dict) and "summary" in parsed:
                    return {
                        "summary": str(parsed.get("summary", "")),
                        "explanation": str(parsed.get("explanation", "")),
                        "anomalies": list(parsed.get("anomalies") or []),
                        "points_of_interest": list(parsed.get("points_of_interest") or []),
                        "related_resources": list(parsed.get("related_resources") or []),
                    }
            except (json.JSONDecodeError, ValueError):
                pass

    # Fallback when LLM is unavailable or returns malformed output
    anomalies: list[str] = []
    if impersonator:
        anomalies.append(f"One user is acting on behalf of another (impersonation detected).")
    if level is not None and level >= 4:
        anomalies.append(f"This is a serious event — severity level {level}.")
    if changes:
        anomalies.append(f"{len(changes)} field(s) were changed in this event.")

    points: list[str] = []
    if linked:
        points.append(f"{len(linked)} related log(s) share the same session or entity.")
    if session_id:
        points.append(f"Session reference: {session_id}.")
    if entities:
        points.append(f"This event involves {len(entities)} linked resource(s).")

    related: list[str] = []
    if session_id:
        related.append(f"session:{session_id}")
    for e in entities[:5]:
        if isinstance(e, dict) and e.get("entityType") is not None:
            related.append(f"entity:{e.get('entityType')}:{e.get('entityId')}")
    for lk in linked:
        if lk.get("logId"):
            related.append(f"log:{log.get('datasetName')}:{lk.get('logId')}")

    return {
        "summary": (
            f"A '{category}' event occurred at severity level {level}."
            + (" Impersonation was detected." if impersonator else "")
        ),
        "explanation": f"Message: {message[:300] if message else 'none'}.",
        "anomalies": anomalies,
        "points_of_interest": points,
        "related_resources": related,
    }


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
