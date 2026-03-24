from fastapi import FastAPI

from app.config import settings
from app.models import AnalyzeRequest, AnalyzeResponse
from app.service import analyze_log


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return analyze_log(request)
