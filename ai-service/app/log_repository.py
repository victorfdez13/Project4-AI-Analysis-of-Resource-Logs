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


def get_related_logs(
    dataset: str,
    anchor_log: dict[str, Any],
    limit: int = 12,
) -> list[dict[str, Any]]:
    """Fetch logs linked by shared session/entity references."""
    collection_name = resolve_collection_name(dataset)
    if collection_name is None:
        return []

    db = get_client()[settings.MONGO_DATABASE_NAME]
    collection = db[collection_name]

    session_id = anchor_log.get("sessionId")
    main_entity = anchor_log.get("mainEntityId")
    impersonator = anchor_log.get("impersonatorMainEntityId")

    or_filters: list[dict[str, Any]] = []
    if session_id:
        or_filters.append({"sessionId": session_id})
    if main_entity:
        or_filters.append({"mainEntityId": main_entity})
        or_filters.append({"entities.entityId": main_entity})
    if impersonator:
        or_filters.append({"impersonatorMainEntityId": impersonator})

    for entity in anchor_log.get("entities") or []:
        if not isinstance(entity, dict):
            continue

        entity_type = entity.get("entityType")
        entity_id = entity.get("entityId")
        if entity_type and entity_id:
            or_filters.append({
                "entities": {
                    "$elemMatch": {
                        "entityType": entity_type,
                        "entityId": entity_id,
                    }
                }
            })
        elif entity_id:
            or_filters.append({"entities.entityId": entity_id})

    if not or_filters:
        return []

    query = {
        "$and": [
            {"logId": {"$ne": anchor_log.get("logId")}},
            {"$or": or_filters},
        ]
    }

    docs = collection.find(query).limit(max(1, limit))
    return [_normalize(doc) for doc in docs if doc is not None]


def is_valid_dataset(dataset: str) -> bool:
    return resolve_collection_name(dataset) is not None
