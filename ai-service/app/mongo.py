from pymongo import MongoClient

from app.config import settings


_client: MongoClient | None = None


def get_client() -> MongoClient:
    """Return a shared MongoClient instance."""
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client


def resolve_collection_name(dataset: str) -> str | None:
    """Map a dataset name like 'DATASET1' to its Mongo collection name."""
    if not dataset:
        return None
    return settings.DATASET_COLLECTION_MAP.get(dataset.upper())
