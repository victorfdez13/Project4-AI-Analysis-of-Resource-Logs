from typing import Any, Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Payload sent by the .NET backend to /analyze.

    Kept permissive so older callers don't break: only resource_id and
    log_text are required, everything else is optional.
    """

    resource_id: str
    log_text: str
    timestamp: Optional[str] = None
    metadata: Optional[dict[str, Any]] = Field(default_factory=dict)
    prompt: Optional[str] = None


class AnalyzeResponse(BaseModel):
    summary: str
    explanation: str
    anomalies: list[str]
    related_resources: list[str]
