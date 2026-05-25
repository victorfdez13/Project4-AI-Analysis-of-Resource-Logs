from typing import Any, Optional
import logging
import time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError

from app import chat_repository, llm, log_repository, saved_log_repository
from app.config import settings
from app.database import init_db
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
    ChatCompletionRequest,
    ChatRequest,
    ChatResponse,
)
from app.service import (
    analyze_logs_batch,
    analyze_speedadmin_log,
    build_log_from_request,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

if settings.CORS_ALLOW_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOW_ORIGINS,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )


@app.on_event("startup")
async def startup() -> None:
    try:
        init_db()
        logger.info("Database initialization completed successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}", exc_info=True)
        raise


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint"""
    try:
        return {"status": "ok", "service": "ai-service"}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {"status": "error", "service": "ai-service", "error": str(e)}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """Accept a free-form prompt, maintain conversation history in SQLite, return LLM response."""
    try:
        if not req.prompt or not req.prompt.strip():
            raise HTTPException(
                status_code=400,
                detail="Prompt cannot be empty"
            )

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
        
        if not response_text:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate response from LLM"
            )

        chat_repository.append_message(session_id, "user", req.prompt)
        chat_repository.append_message(session_id, "assistant", response_text)

        summary = (
            llm.complete(f"Summarize in one sentence: {req.prompt} → {response_text}")
            or response_text[:120]
        )

        logger.info(f"Chat request completed for session {session_id}")
        return ChatResponse(session_id=session_id, response=response_text, summary=summary)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing chat request: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error processing chat request"
        )


@app.post("/v1/chat/completions")
def chat_completions(req: ChatCompletionRequest) -> dict[str, Any]:
    """Small OpenAI-compatible chat endpoint backed by Ollama."""
    try:
        if not req.messages:
            raise HTTPException(status_code=400, detail="messages cannot be empty")

        messages = [
            {
                "role": str(message.get("role") or "user"),
                "content": str(message.get("content") or ""),
            }
            for message in req.messages
            if isinstance(message, dict)
        ]
        if not messages:
            raise HTTPException(status_code=400, detail="messages cannot be empty")

        response_text = llm.complete_messages_strict(messages)
        if not response_text:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate response from LLM",
            )

        model_name = req.model or settings.OLLAMA_MODEL or "text-generator"
        return {
            "id": f"chatcmpl-{int(time.time() * 1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_text,
                    },
                    "finish_reason": "stop",
                }
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing chat completion request: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error processing chat completion request",
        )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Backwards-compatible endpoint used by the .NET backend.

    If the metadata contains a dataset and logId, the result is also
    persisted to savedlogs.saved_logs (best-effort: a Mongo failure here
    must not break the response to the backend).
    """
    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(
                status_code=400,
                detail="Prompt cannot be empty"
            )

        metadata = request.metadata or {}
        dataset = metadata.get("dataset") or metadata.get("datasetName")
        log_id = metadata.get("logId")
        user_query = (
            metadata.get("query")
            or metadata.get("prompt")
            or metadata.get("userPrompt")
            or request.prompt
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
                logger.info(f"Successfully loaded log {log_id} from dataset {dataset_upper}")
            except (PyMongoError, ValueError) as e:
                logger.warning(f"Failed to load additional log data: {str(e)}", exc_info=True)
                linked_logs = []

        response = AnalyzeResponse(
            **analyze_speedadmin_log(
                anchor_log,
                linked_logs=linked_logs,
                user_query=str(user_query).strip() if user_query else None,
            )
        )

        # Best-effort saving - don't fail the response if persistence fails
        if dataset and log_id is not None:
            try:
                saved_log_repository.save_analysis(
                    dataset=str(dataset).upper(),
                    log_id=int(log_id),
                    original_log=anchor_log,
                    analysis=response.model_dump(),
                    prompt=str(user_query).strip() if user_query else None,
                )
                logger.info(f"Analysis saved for log {log_id} in dataset {dataset}")
            except (PyMongoError, ValueError) as e:
                logger.warning(f"Failed to save analysis (non-critical): {str(e)}", exc_info=True)

        return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing analysis request: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error processing analysis request"
        )


@app.post("/analyze-batch", response_model=BatchAnalyzeResponse)
def analyze_batch(request: BatchAnalyzeRequest) -> BatchAnalyzeResponse:
    """Aggregate-analyse a list of logs in one request."""
    try:
        if not request.logs:
            raise HTTPException(status_code=400, detail="logs list cannot be empty.")

        result = analyze_logs_batch(request.logs, user_query=request.prompt)
        return BatchAnalyzeResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing batch analysis")


@app.get("/logs/{log_id}")
def get_log(log_id: int, dataset: str = Query(...)) -> dict[str, Any]:
    """Fetch a real SpeedAdmin log by dataset and logId."""
    try:
        if not dataset or not dataset.strip():
            raise HTTPException(
                status_code=400,
                detail="Dataset parameter is required"
            )

        if log_id <= 0:
            raise HTTPException(
                status_code=400,
                detail="LogId must be a positive integer"
            )

        if not log_repository.is_valid_dataset(dataset):
            logger.warning(f"Invalid dataset requested: {dataset}")
            raise HTTPException(
                status_code=400, 
                detail=f"Unknown dataset '{dataset}'."
            )

        log = log_repository.get_log(dataset.upper(), log_id)
        
        if log is None:
            logger.warning(f"Log not found: dataset={dataset}, logId={log_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Log {log_id} not found in dataset {dataset}.",
            )
        
        logger.info(f"Successfully retrieved log {log_id} from dataset {dataset}")
        return log
    
    except HTTPException:
        raise
    except PyMongoError as e:
        logger.error(f"MongoDB error retrieving log: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Database error: Unable to retrieve log"
        )
    except Exception as e:
        logger.error(f"Error retrieving log: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error retrieving log"
        )


@app.post("/logs/{log_id}/analyze")
def analyze_real_log(
    log_id: int,
    dataset: str = Query(...),
    prompt: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    """Analyze a real SpeedAdmin log and persist the result.

    The optional ``prompt`` query parameter is the user's query that
    motivated the analysis. It is persisted alongside the result so the
    saved analysis can be reused later (project proposal US5 / FR5).
    """
    try:
        if not dataset or not dataset.strip():
            raise HTTPException(
                status_code=400,
                detail="Dataset parameter is required"
            )

        if log_id <= 0:
            raise HTTPException(
                status_code=400,
                detail="LogId must be a positive integer"
            )

        if not log_repository.is_valid_dataset(dataset):
            logger.warning(f"Invalid dataset requested: {dataset}")
            raise HTTPException(
                status_code=400, 
                detail=f"Unknown dataset '{dataset}'."
            )

        dataset_upper = dataset.upper()

        log = log_repository.get_log(dataset_upper, log_id)
        
        if log is None:
            logger.warning(f"Log not found for analysis: dataset={dataset}, logId={log_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Log {log_id} not found in dataset {dataset}.",
            )

        linked_logs = log_repository.get_related_logs(dataset_upper, log)
        logger.info(f"Retrieved {len(linked_logs)} related logs for analysis")

        analysis = analyze_speedadmin_log(log, linked_logs=linked_logs, user_query=prompt)

        saved = saved_log_repository.save_analysis(
            dataset=dataset_upper,
            log_id=log_id,
            original_log=log,
            analysis=analysis,
            prompt=prompt,
        )
        
        logger.info(f"Analysis saved for log {log_id} in dataset {dataset}")
        return saved
    
    except HTTPException:
        raise
    except PyMongoError as e:
        logger.error(f"MongoDB error during analysis: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Database error: Unable to complete analysis"
        )
    except Exception as e:
        logger.error(f"Error analyzing real log: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error analyzing log"
        )


@app.get("/saved-logs")
def list_saved_logs(
    dataset: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[dict[str, Any]]:
    """List saved analyses, newest first."""
    try:
        if dataset is not None and not log_repository.is_valid_dataset(dataset):
            logger.warning(f"Invalid dataset requested: {dataset}")
            raise HTTPException(
                status_code=400, 
                detail=f"Unknown dataset '{dataset}'."
            )

        results = saved_log_repository.list_saved(
            dataset=dataset.upper() if dataset else None,
            limit=limit,
        )
        
        logger.info(f"Retrieved {len(results)} saved analyses")
        return results
    
    except HTTPException:
        raise
    except PyMongoError as e:
        logger.error(f"MongoDB error listing saved logs: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Database error: Unable to list saved analyses"
        )
    except Exception as e:
        logger.error(f"Error listing saved logs: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error listing saved analyses"
        )


@app.get("/saved-logs/{log_id}")
def get_saved_log(log_id: int, dataset: str = Query(...)) -> dict[str, Any]:
    """Fetch a single saved analysis by dataset and logId."""
    try:
        if not dataset or not dataset.strip():
            raise HTTPException(
                status_code=400,
                detail="Dataset parameter is required"
            )

        if log_id <= 0:
            raise HTTPException(
                status_code=400,
                detail="LogId must be a positive integer"
            )

        if not log_repository.is_valid_dataset(dataset):
            logger.warning(f"Invalid dataset requested: {dataset}")
            raise HTTPException(
                status_code=400, 
                detail=f"Unknown dataset '{dataset}'."
            )

        saved = saved_log_repository.get_saved(dataset.upper(), log_id)
        
        if saved is None:
            logger.warning(f"Saved analysis not found: dataset={dataset}, logId={log_id}")
            raise HTTPException(
                status_code=404,
                detail=f"No saved analysis for log {log_id} in dataset {dataset}.",
            )
        
        logger.info(f"Successfully retrieved saved analysis for log {log_id}")
        return saved
    
    except HTTPException:
        raise
    except PyMongoError as e:
        logger.error(f"MongoDB error retrieving saved log: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Database error: Unable to retrieve saved analysis"
        )
    except Exception as e:
        logger.error(f"Error retrieving saved log: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error retrieving saved analysis"
        )
