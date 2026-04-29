from pymongo import MongoClient
from pymongo.collection import Collection

from app.config import settings


mongo_client = MongoClient(settings.MONGO_CONNECTION_STRING)
mongo_database = mongo_client[settings.MONGO_DATABASE_NAME]


def _get_collection(dataset: str) -> Collection:
    dataset_name = dataset.strip().upper()

    if dataset_name == "DATASET1":
        return mongo_database[settings.MONGO_DATASET1_COLLECTION]

    if dataset_name == "DATASET2":
        return mongo_database[settings.MONGO_DATASET2_COLLECTION]

    raise ValueError(f"Unsupported dataset '{dataset}'. Use DATASET1 or DATASET2.")


def fetch_real_log(dataset: str, log_id: int) -> dict | None:
    collection = _get_collection(dataset)
    return collection.find_one({"logId": log_id}, {"_id": 0})
