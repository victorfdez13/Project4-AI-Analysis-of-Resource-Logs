from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.mongo import get_client


def _collection():
    db = get_client()[settings.MONGO_SAVEDLOGS_DATABASE_NAME]
    return db[settings.MONGO_SAVEDLOGS_COLLECTION]


def _normalize(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Make a saved-log document JSON-serializable."""
    if doc is None:
        return None
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    if isinstance(doc.get("analyzedAt"), datetime):
        doc["analyzedAt"] = doc["analyzedAt"].isoformat()
    return doc


def save_analysis(
    dataset: str,
    log_id: int | None,
    original_log: dict[str, Any] | None,
    analysis: dict[str, Any],
    prompt: str | None = None,
) -> dict[str, Any]:
    """
    Insert or update an analysis result.

    Uniqueness key is (dataset, logId). When logId is missing (e.g. an ad-hoc
    /analyze call without metadata) the document is simply inserted without
    upsert semantics so we do not collapse different ad-hoc analyses together.

    The user prompt that produced the analysis is persisted alongside the
    result so saved analyses can be reused or compared (project proposal
    US5 / FR5).
    """
    now = datetime.now(timezone.utc)
    document = {
        "dataset": dataset,
        "logId": log_id,
        "prompt": prompt,
        "analyzedAt": now,
        "originalLog": original_log,
        "analysis": analysis,
    }

    collection = _collection()
    if log_id is not None and dataset:
        collection.update_one(
            {"dataset": dataset, "logId": log_id},
            {"$set": document},
            upsert=True,
        )
        saved = collection.find_one({"dataset": dataset, "logId": log_id})
    else:
        result = collection.insert_one(document)
        saved = collection.find_one({"_id": result.inserted_id})

    return _normalize(saved) or document


def get_saved(dataset: str, log_id: int) -> dict[str, Any] | None:
    """Fetch a saved analysis by dataset and logId."""
    doc = _collection().find_one({"dataset": dataset, "logId": log_id})
    return _normalize(doc)


def list_saved(dataset: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """List saved analyses, newest first."""
    query: dict[str, Any] = {}
    if dataset:
        query["dataset"] = dataset

    cursor = _collection().find(query).sort("analyzedAt", -1).limit(limit)
    return [_normalize(doc) for doc in cursor if doc is not None]
