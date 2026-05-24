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
    linked = linked_logs or []

    changes_text = ", ".join(
        str(c.get("propertyName", "")) for c in changes[:5] if isinstance(c, dict)
    ) or "none"

    entity_types = ", ".join(
        str(e.get("entityType", "")) for e in entities[:5] if isinstance(e, dict)
    ) or "none"

    linked_summary = f"{len(linked)} related log(s)" if linked else "no linked logs"
    impersonation = f"impersonation by id {impersonator}" if impersonator else "none"
    user_section = f"\nUser question: {user_query}" if user_query else ""

    prompt = f"""Analyze this SpeedAdmin school-management log entry and return JSON only.

Category: {category}
Level: {level}
Message: {message}
Time: {timestamp}
Changed fields: {changes_text}
Entity types: {entity_types}
Context: {linked_summary}
Impersonation: {impersonation}{user_section}

Return JSON with exactly these keys (no markdown, no code fences):
{{
  "summary": "<one sentence>",
  "explanation": "<2-4 sentences>",
  "anomalies": ["<anomaly if any>"],
  "related_resources": ["<resource reference if any>"]
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
                        "related_resources": list(parsed.get("related_resources") or []),
                    }
            except (json.JSONDecodeError, ValueError):
                pass

    # Fallback when LLM is unavailable or returns malformed output
    anomalies = []
    if impersonator:
        anomalies.append(f"Impersonation detected (id={impersonator}).")
    if level is not None and level != 2:
        anomalies.append(f"Unusual log level: {level}.")
    if changes:
        anomalies.append(f"Contains {len(changes)} field change(s).")

    return {
        "summary": f"Log in category '{category}' at level {level} with {len(linked)} linked log(s).",
        "explanation": (
            f"Category: {category}. Message: {message[:200] if message else 'none'}."
        ),
        "anomalies": anomalies,
        "related_resources": [
            f"log:{log.get('datasetName')}:{lk.get('logId')}"
            for lk in linked
            if lk.get("logId")
        ],
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
