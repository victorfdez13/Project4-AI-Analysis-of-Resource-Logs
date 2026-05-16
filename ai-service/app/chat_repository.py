import uuid
from datetime import datetime, timezone

from app.database import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_or_create_session(session_id: str | None) -> str:
    sid = session_id or str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO sessions VALUES (?, ?)", (sid, _now())
        )
    return sid


def append_message(session_id: str, role: str, content: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, role, content, _now()),
        )


def get_history(session_id: str, limit: int = 20) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
