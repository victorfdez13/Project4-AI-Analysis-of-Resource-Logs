"""LLM backend with three-tier fallback:
1. OpenAI (if LLM_API_KEY is set and has credits)
2. Ollama (free local model — install from ollama.com, run: ollama run llama3.2)
3. Smart mock (works with zero setup, good enough for a demo)
"""

import re
from openai import OpenAI
from app.config import settings

_openai_client: OpenAI | None = None
_ollama_client: OpenAI | None = None


def _get_openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.LLM_API_KEY)
    return _openai_client


def _get_ollama() -> OpenAI:
    # Ollama exposes an OpenAI-compatible API, so the same client works
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = OpenAI(
            base_url=settings.OLLAMA_BASE_URL,
            api_key="ollama",
        )
    return _ollama_client


def _ollama_available() -> bool:
    import urllib.request
    try:
        urllib.request.urlopen("http://localhost:11434", timeout=1)
        return True
    except Exception:
        return False


def _call(client: OpenAI, model: str, messages: list[dict]) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        max_tokens=400,
    )
    return (response.choices[0].message.content or "").strip()


# ---------------------------------------------------------------------------
# Mock fallback — keyword-based, good enough for a university demo
# ---------------------------------------------------------------------------

_MOCK_RULES: list[tuple[list[str], str]] = [
    (
        ["login", "loginsystem", "authentication", "session"],
        "This is a LoginSystem event that records a user authentication attempt. "
        "SpeedAdmin logs these to track who accessed the system and when. "
        "A missing sessionId or an unusual log level may indicate a failed or suspicious login.",
    ),
    (
        ["error", "level 4", "level: 4", "critical", "exception"],
        "This log entry has an elevated severity level, indicating an error or critical event. "
        "In SpeedAdmin, level 4 events typically require attention — they may reflect a failed operation, "
        "a data inconsistency, or an unexpected system state.",
    ),
    (
        ["impersonat"],
        "Impersonation is recorded when an administrator acts on behalf of another user. "
        "SpeedAdmin captures both the original user and the impersonator in the log for audit purposes.",
    ),
    (
        ["student", "pupil", "registration", "enroll"],
        "This event relates to student data in SpeedAdmin. "
        "Registration logs track when students are enrolled in or removed from courses, "
        "and changes to student profiles are recorded with before/after field values.",
    ),
    (
        ["teacher", "staff", "salary", "payroll"],
        "This log is related to teacher or staff management. "
        "SpeedAdmin records changes to teacher profiles, salary configurations, and booking assignments. "
        "These events are important for payroll audit trails.",
    ),
    (
        ["booking", "course", "slot", "schedule"],
        "This entry relates to the booking or scheduling system. "
        "SpeedAdmin uses bookings to represent course instances with associated time slots, teachers, and students.",
    ),
    (
        ["change", "propertyname", "previousvalue", "newvalue", "updated", "modified"],
        "This log contains field-level change records. "
        "Each LogChange entry captures the property name, its previous value, and its new value, "
        "giving a complete audit trail of what was modified.",
    ),
    (
        ["dataset1", "dataset 1", "danish", "denmark"],
        "DATASET1 contains SpeedAdmin data from Danish schools. "
        "Log messages in this dataset are written in English and Danish.",
    ),
    (
        ["dataset2", "dataset 2", "iceland", "icelandic"],
        "DATASET2 contains SpeedAdmin data from Icelandic schools. "
        "Log messages in this dataset are written in Icelandic.",
    ),
    (
        ["anomaly", "anomalies", "unusual", "suspicious", "detect"],
        "The AI service detects anomalies by checking for impersonation, "
        "elevated log levels, missing sessionIds on login events, "
        "and repeated message patterns across related logs in the same session or entity context.",
    ),
    (
        ["summary", "explain", "what", "how", "why", "mean"],
        "SpeedAdmin logs record system events for schools, including user logins, "
        "student enrolments, teacher assignments, equipment bookings, and administrative changes. "
        "Each log entry has a category, severity level, message, and references to the entities involved.",
    ),
]

_MOCK_DEFAULT = (
    "SpeedAdmin is a school-management system that logs all significant events — "
    "logins, profile changes, bookings, registrations, and more. "
    "This AI service analyses those logs to detect anomalies, summarise activity, "
    "and answer questions about what happened in the system."
)


def _mock_response(messages: list[dict]) -> str:
    last_user = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
    )
    text = last_user.lower()
    for keywords, reply in _MOCK_RULES:
        if any(kw in text for kw in keywords):
            return reply
    return _MOCK_DEFAULT


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def complete_messages(messages: list[dict]) -> str:
    """Try OpenAI → Ollama → mock. Never raises."""
    # 1. OpenAI
    if settings.LLM_API_KEY:
        try:
            return _call(_get_openai(), settings.MODEL_NAME, messages)
        except Exception:
            pass

    # 2. Ollama (free local model)
    if _ollama_available():
        try:
            return _call(_get_ollama(), settings.OLLAMA_MODEL, messages)
        except Exception:
            pass

    # 3. Smart mock
    return _mock_response(messages)


def complete(prompt: str) -> str:
    """Single-turn convenience wrapper around complete_messages."""
    return complete_messages([{"role": "user", "content": prompt}])
