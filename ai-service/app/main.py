from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from pymongo.errors import PyMongoError

from app import chat_repository, llm, log_repository, saved_log_repository
from app.config import settings
from app.database import init_db
from app.models import AnalyzeRequest, AnalyzeResponse, ChatRequest, ChatResponse
from app.service import (
    analyze_speedadmin_log,
    build_log_from_request,
)


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)


@app.on_event("startup")
async def startup() -> None:
    init_db()


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """Accept a free-form prompt, maintain conversation history in SQLite, return LLM response."""
    session_id = chat_repository.get_or_create_session(req.session_id)
    history = chat_repository.get_history(session_id)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant for a SpeedAdmin school-management system. "
                "Answer concisely and clearly."
            ),
        },
        *history,
        {"role": "user", "content": req.prompt},
    ]

    response_text = llm.complete_messages(messages)

    chat_repository.append_message(session_id, "user", req.prompt)
    chat_repository.append_message(session_id, "assistant", response_text)

    summary = (
        llm.complete(f"Summarize in one sentence: {req.prompt} → {response_text}")
        or response_text[:120]
    )

    return ChatResponse(session_id=session_id, response=response_text, summary=summary)


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Backwards-compatible endpoint used by the .NET backend.

    If the metadata contains a dataset and logId, the result is also
    persisted to savedlogs.saved_logs (best-effort: a Mongo failure here
    must not break the response to the backend).
    """
    metadata = request.metadata or {}
    dataset = metadata.get("dataset") or metadata.get("datasetName")
    log_id = metadata.get("logId")
    user_query = (
        metadata.get("query")
        or metadata.get("prompt")
        or metadata.get("userPrompt")
    )

    anchor_log = build_log_from_request(request)
    linked_logs: list[dict[str, Any]] = []

    if dataset and log_id is not None and log_repository.is_valid_dataset(str(dataset)):
        try:
            dataset_upper = str(dataset).upper()
            stored_log = log_repository.get_log(dataset_upper, int(log_id))
            if stored_log is not None:
                anchor_log = {
                    **stored_log,
                    **{
                        key: value
                        for key, value in anchor_log.items()
                        if value not in (None, "", [], {})
                    },
                }
                linked_logs = log_repository.get_related_logs(
                    dataset_upper,
                    anchor_log,
                )
        except (PyMongoError, ValueError):
            linked_logs = []

    response = AnalyzeResponse(
        **analyze_speedadmin_log(
            anchor_log,
            linked_logs=linked_logs,
            user_query=str(user_query).strip() if user_query else None,
        )
    )

    if dataset and log_id is not None:
        try:
            saved_log_repository.save_analysis(
                dataset=str(dataset).upper(),
                log_id=int(log_id),
                original_log=anchor_log,
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

    try:
        linked_logs = log_repository.get_related_logs(dataset_upper, log)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"MongoDB error: {exc}") from exc

    analysis = analyze_speedadmin_log(log, linked_logs=linked_logs)

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
