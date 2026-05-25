"""Model-agnostic LLM interface for ai-service.

Select the provider via the LLM_PROVIDER environment variable:
  "ollama"  — local Ollama container (default); falls back to mock if unreachable
  "generic" — any OpenAI-compatible endpoint (set LLM_BASE_URL / LLM_MODEL / LLM_API_KEY)
  "mock"    — keyword-based responses, no network calls (useful for tests / demos)
"""

from typing import Protocol, runtime_checkable

from openai import OpenAI

from app.config import settings


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------

@runtime_checkable
class LlmProvider(Protocol):
    def complete_messages(self, messages: list[dict]) -> str: ...


# ---------------------------------------------------------------------------
# Mock provider — keyword rules, zero network dependency
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
        "In SpeedAdmin, level 4 events typically require attention — they may reflect a failed "
        "operation, a data inconsistency, or an unexpected system state.",
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
        "SpeedAdmin records changes to teacher profiles, salary configurations, and booking "
        "assignments. These events are important for payroll audit trails.",
    ),
    (
        ["booking", "course", "slot", "schedule"],
        "This entry relates to the booking or scheduling system. "
        "SpeedAdmin uses bookings to represent course instances with associated time slots, "
        "teachers, and students.",
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
        "The AI service detects anomalies by checking for impersonation, elevated log levels, "
        "missing sessionIds on login events, and repeated message patterns across related logs "
        "in the same session or entity context.",
    ),
    (
        ["summary", "explain", "what", "how", "why", "mean"],
        "SpeedAdmin logs record system events for schools, including user logins, student "
        "enrolments, teacher assignments, equipment bookings, and administrative changes. "
        "Each log entry has a category, severity level, message, and references to the entities involved.",
    ),
]

_MOCK_DEFAULT = (
    "SpeedAdmin is a school-management system that logs all significant events — "
    "logins, profile changes, bookings, registrations, and more. "
    "This AI service analyses those logs to detect anomalies, summarise activity, "
    "and answer questions about what happened in the system."
)


class MockProvider:
    """Keyword-based responses — no network calls."""

    def complete_messages(self, messages: list[dict]) -> str:
        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
        )
        text = last_user.lower()
        for keywords, reply in _MOCK_RULES:
            if any(kw in text for kw in keywords):
                return reply
        return _MOCK_DEFAULT


# ---------------------------------------------------------------------------
# Ollama provider — local container, falls back to mock if unreachable
# ---------------------------------------------------------------------------

class OllamaProvider:
    """Calls the Ollama container via its OpenAI-compatible API.

    Falls back to MockProvider when Ollama is unreachable, so the service
    degrades gracefully without crashing.
    """

    def __init__(self) -> None:
        self._client: OpenAI | None = None
        self._mock = MockProvider()

    def _get_client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(
                base_url=settings.OLLAMA_BASE_URL,
                api_key="ollama",
            )
        return self._client

    def _is_available(self) -> bool:
        import urllib.request
        base = settings.OLLAMA_BASE_URL.split("/v1")[0]
        try:
            urllib.request.urlopen(base, timeout=1)
            return True
        except Exception:
            return False

    def _call(self, messages: list[dict]) -> str:
        response = self._get_client().chat.completions.create(
            model=settings.OLLAMA_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=400,
        )
        return (response.choices[0].message.content or "").strip()

    def complete_messages(self, messages: list[dict]) -> str:
        if self._is_available():
            try:
                return self._call(messages)
            except Exception:
                pass
        return self._mock.complete_messages(messages)


# ---------------------------------------------------------------------------
# Generic provider — any OpenAI-compatible endpoint (OpenAI, Together, etc.)
# ---------------------------------------------------------------------------

class GenericOpenAiCompatibleProvider:
    """Any OpenAI-compatible API endpoint.

    Configured via LLM_BASE_URL, LLM_MODEL, LLM_API_KEY.
    Does NOT fall back to mock — raises so the caller gets a proper error.
    """

    def __init__(self) -> None:
        self._client: OpenAI | None = None

    def _get_client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(
                base_url=settings.LLM_BASE_URL or None,
                api_key=settings.LLM_API_KEY or "no-key",
            )
        return self._client

    def complete_messages(self, messages: list[dict]) -> str:
        response = self._get_client().chat.completions.create(
            model=settings.LLM_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=400,
        )
        return (response.choices[0].message.content or "").strip()


# ---------------------------------------------------------------------------
# Factory + module-level singleton
# ---------------------------------------------------------------------------

def get_provider() -> LlmProvider:
    name = settings.LLM_PROVIDER.lower()
    if name == "ollama":
        return OllamaProvider()
    if name in {"generic", "openai", "openai-compatible"}:
        return GenericOpenAiCompatibleProvider()
    return MockProvider()


_provider: LlmProvider | None = None


def _get() -> LlmProvider:
    global _provider
    if _provider is None:
        _provider = get_provider()
    return _provider


# ---------------------------------------------------------------------------
# Public API — same signatures as before; service.py / main.py unchanged
# ---------------------------------------------------------------------------

def complete_messages(messages: list[dict]) -> str:
    """Route to the configured LLM provider. Never raises."""
    try:
        return _get().complete_messages(messages)
    except Exception:
        return MockProvider().complete_messages(messages)


def complete(prompt: str) -> str:
    """Single-turn convenience wrapper."""
    return complete_messages([{"role": "user", "content": prompt}])
