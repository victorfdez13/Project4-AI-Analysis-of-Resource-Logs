from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError

from app import log_repository
from app.config import settings
from app.models import AnalyzeRequest, AnalyzeResponse, DatasetStudyResponse
from app.service import (
    analyze_speedadmin_log,
    build_log_from_request,
    extract_request_options,
    study_dataset,
)


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

if settings.CORS_ALLOW_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOW_ORIGINS,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )


def _validate_dataset(dataset: str) -> str:
    if not dataset or not dataset.strip():
        raise HTTPException(status_code=400, detail="Dataset parameter is required.")

    dataset_upper = dataset.upper()
    if not log_repository.is_valid_dataset(dataset_upper):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown dataset '{dataset}'.",
        )
    return dataset_upper


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.APP_NAME}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    if not request.log_text or not request.log_text.strip():
        raise HTTPException(status_code=400, detail="log_text cannot be empty.")

    try:
        options = extract_request_options(request)
        request_log = build_log_from_request(request)
        result = analyze_speedadmin_log(
            request_log,
            requested_log_id=options["requested_log_id"],
            user_prompt=options["user_prompt"],
            selected_logs_input=options["selected_logs"],
            active_filters_input=options["active_filters"],
        )
        return AnalyzeResponse(**result)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database error: unable to analyze the log.",
        ) from exc


@app.get("/logs/{log_id}")
def get_log(log_id: int, dataset: str = Query(...)) -> dict[str, Any]:
    dataset_upper = _validate_dataset(dataset)

    if log_id <= 0:
        raise HTTPException(status_code=400, detail="logId must be positive.")

    try:
        log = log_repository.get_log(dataset_upper, log_id)
        if log is None:
            raise HTTPException(
                status_code=404,
                detail=f"Log {log_id} not found in dataset {dataset_upper}.",
            )
        return log
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database error: unable to retrieve the log.",
        ) from exc


@app.post("/logs/{log_id}/analyze", response_model=AnalyzeResponse)
def analyze_real_log(
    log_id: int,
    dataset: str = Query(...),
    prompt: Optional[str] = Query(default=None),
) -> AnalyzeResponse:
    dataset_upper = _validate_dataset(dataset)

    if log_id <= 0:
        raise HTTPException(status_code=400, detail="logId must be positive.")

    try:
        log = log_repository.get_log(dataset_upper, log_id)
        if log is None:
            raise HTTPException(
                status_code=404,
                detail=f"Log {log_id} not found in dataset {dataset_upper}.",
            )

        result = analyze_speedadmin_log(
            log,
            requested_log_id=log_id,
            user_prompt=prompt.strip() if prompt else None,
        )
        return AnalyzeResponse(**result)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database error: unable to analyze the log.",
        ) from exc


@app.get("/datasets/{dataset}/study", response_model=DatasetStudyResponse)
def dataset_study(
    dataset: str,
    limit: int = Query(default=80, ge=20, le=300),
) -> DatasetStudyResponse:
    dataset_upper = _validate_dataset(dataset)

    try:
        logs = log_repository.get_recent_logs(dataset_upper, limit=limit)
        if not logs:
            raise HTTPException(
                status_code=404,
                detail=f"No logs were found in dataset {dataset_upper}.",
            )

        return DatasetStudyResponse(**study_dataset(dataset_upper, logs))
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database error: unable to study the dataset.",
        ) from exc
