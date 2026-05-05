from typing import Any

from app.config import settings
from app.mongo import get_client, resolve_collection_name


def _normalize(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Make a Mongo document JSON-serializable (ObjectId -> str)."""
    if doc is None:
        return None
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def get_log(dataset: str, log_id: int) -> dict[str, Any] | None:
    """Fetch a real SpeedAdmin log by dataset and logId."""
    collection_name = resolve_collection_name(dataset)
    if collection_name is None:
        return None

    db = get_client()[settings.MONGO_DATABASE_NAME]
    doc = db[collection_name].find_one({"logId": log_id})
    return _normalize(doc)


def is_valid_dataset(dataset: str) -> bool:
    return resolve_collection_name(dataset) is not None
