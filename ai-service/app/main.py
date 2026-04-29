from fastapi import FastAPI, HTTPException

from app.config import settings
from app.log_repository import fetch_real_log
from app.models import AnalyzeRequest, AnalyzeResponse
from app.service import analyze_log


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return analyze_log(request)


@app.get("/logs/{log_id}")
def get_log(log_id: int, dataset: str = "DATASET1") -> dict:
    try:
        log = fetch_real_log(dataset, log_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if log is None:
        raise HTTPException(status_code=404, detail="Log not found.")

    return log
