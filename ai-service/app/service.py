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


def analyze_logs_batch(
    logs: list[dict[str, Any]],
    user_query: str | None = None,
) -> dict[str, Any]:
    """Aggregate-analyse a list of SpeedAdmin logs in one LLM call."""
    if not logs:
        return {
            "summary": "No logs were provided for analysis.",
            "anomalies": [],
            "points_of_interest": [],
            "log_count": 0,
        }

    lines: list[str] = []
    for i, log in enumerate(logs[:30], 1):  # cap at 30 to stay within token limits
        category = log.get("category") or "Unknown"
        level = log.get("level", "?")
        message = str(log.get("message") or "").strip()[:120]
        timestamp = str(log.get("time") or "")[:19]
        impersonator = log.get("impersonatorMainEntityId")
        flag = " [IMPERSONATION]" if impersonator else ""
        lines.append(f"{i}. [{category}] Level {level}: \"{message}\" ({timestamp}){flag}")

    log_list = "\n".join(lines)
    omitted = f"\n... and {len(logs) - 30} more logs not shown." if len(logs) > 30 else ""
    user_section = f"\nUser question: {user_query}" if user_query else ""

    prompt = f"""You are analyzing a batch of {len(logs)} SpeedAdmin school-management log entries.
Write for non-technical school staff — be clear, concise, and avoid jargon.

Logs:
{log_list}{omitted}{user_section}

Return valid JSON only — no markdown, no code fences:
{{
  "summary": "<overall summary of what happened across all these logs, in plain language>",
  "anomalies": ["<notable issue or suspicious pattern across logs — empty list if none>"],
  "points_of_interest": ["<cross-log pattern, repeated category, or key observation>"]
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
                        "anomalies": list(parsed.get("anomalies") or []),
                        "points_of_interest": list(parsed.get("points_of_interest") or []),
                        "log_count": len(logs),
                    }
            except (json.JSONDecodeError, ValueError):
                pass

    # Fallback: rule-based aggregation
    from collections import Counter
    categories: Counter[str] = Counter(
        str(l.get("category") or "Unknown") for l in logs
    )
    high_severity = sum(1 for l in logs if (l.get("level") or 0) >= 4)
    impersonations = sum(1 for l in logs if l.get("impersonatorMainEntityId"))

    anomalies: list[str] = []
    if high_severity:
        anomalies.append(f"{high_severity} log(s) with severity level 4 or higher.")
    if impersonations:
        anomalies.append(f"{impersonations} impersonation event(s) detected.")

    top = ", ".join(f"'{c}' ({n})" for c, n in categories.most_common(3))
    poi = [f"Top categories: {top}."] if top else []

    return {
        "summary": f"Batch of {len(logs)} log(s) across {len(categories)} category/categories.",
        "anomalies": anomalies,
        "points_of_interest": poi,
        "log_count": len(logs),
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
