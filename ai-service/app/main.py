from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from pymongo.errors import PyMongoError

from app import log_repository, saved_log_repository
from app.config import settings
from app.log_repository import fetch_real_log
from app.models import AnalyzeRequest, AnalyzeResponse
from app.service import analyze_log, analyze_speedadmin_log


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Backwards-compatible endpoint used by the .NET backend.

    If the metadata contains a dataset and logId, the result is also
    persisted to savedlogs.saved_logs (best-effort: a Mongo failure here
    must not break the response to the backend).
    """
    response = analyze_log(request)

    metadata = request.metadata or {}
    dataset = metadata.get("dataset") or metadata.get("datasetName")
    log_id = metadata.get("logId")

    if dataset and log_id is not None:
        try:
            saved_log_repository.save_analysis(
                dataset=str(dataset).upper(),
                log_id=int(log_id),
                original_log={
                    "message": request.log_text,
                    "timestamp": request.timestamp,
                    "metadata": metadata,
                },
                analysis=response.model_dump(),
            )
        except (PyMongoError, ValueError):
            pass

    return response


@app.get("/logs/{log_id}")
def get_log(log_id: int, dataset: str = Query(...)) -> dict[str, Any]:
    """Fetch a real SpeedAdmin log by dataset and logId."""
    if not log_repository.is_valid_dataset(dataset):
        raise HTTPException(
            status_code=400, detail=f"Unknown dataset '{dataset}'."
        )

    try:
        log = log_repository.get_log(dataset.upper(), log_id)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB error: {exc}") from exc

    if log is None:
        raise HTTPException(
            status_code=404,
            detail=f"Log {log_id} not found in dataset {dataset}.",
        )
    return log


@app.post("/logs/{log_id}/analyze")
def analyze_real_log(
    log_id: int, dataset: str = Query(...)
) -> dict[str, Any]:
    """Analyze a real SpeedAdmin log and persist the result."""
    if not log_repository.is_valid_dataset(dataset):
        raise HTTPException(
            status_code=400, detail=f"Unknown dataset '{dataset}'."
        )

    dataset_upper = dataset.upper()

    try:
        log = log_repository.get_log(dataset_upper, log_id)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB error: {exc}") from exc

    if log is None:
        raise HTTPException(
            status_code=404,
            detail=f"Log {log_id} not found in dataset {dataset}.",
        )

    analysis = analyze_speedadmin_log(log)

    try:
        saved = saved_log_repository.save_analysis(
            dataset=dataset_upper,
            log_id=log_id,
            original_log=log,
            analysis=analysis,
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB error: {exc}") from exc

    return saved


@app.get("/saved-logs")
def list_saved_logs(
    dataset: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[dict[str, Any]]:
    """List saved analyses, newest first."""
    if dataset is not None and not log_repository.is_valid_dataset(dataset):
        raise HTTPException(
            status_code=400, detail=f"Unknown dataset '{dataset}'."
        )

    try:
        return saved_log_repository.list_saved(
            dataset=dataset.upper() if dataset else None,
            limit=limit,
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB error: {exc}") from exc


@app.get("/saved-logs/{log_id}")
def get_saved_log(log_id: int, dataset: str = Query(...)) -> dict[str, Any]:
    """Fetch a single saved analysis by dataset and logId."""
    if not log_repository.is_valid_dataset(dataset):
        raise HTTPException(
            status_code=400, detail=f"Unknown dataset '{dataset}'."
        )

    try:
        saved = saved_log_repository.get_saved(dataset.upper(), log_id)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB error: {exc}") from exc

    if saved is None:
        raise HTTPException(
            status_code=404,
            detail=f"No saved analysis for log {log_id} in dataset {dataset}.",
        )
    return saved
