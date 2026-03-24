from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    resource_id: str
    log_text: str
    timestamp: datetime
    metadata: dict[str, Any]


class AnalyzeResponse(BaseModel):
    summary: str
    explanation: str
    anomalies: list[str]
    related_resources: list[str]
