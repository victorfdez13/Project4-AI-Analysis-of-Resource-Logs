import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "ai-service")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    MODEL_NAME: str = os.getenv("MODEL_NAME", "gpt-4o-mini")
    MONGO_CONNECTION_STRING: str = os.getenv(
        "MONGO_CONNECTION_STRING",
        "mongodb://admin:mongodb123@localhost:27017",
    )
    MONGO_DATABASE_NAME: str = os.getenv("MONGO_DATABASE_NAME", "resource_logs")
    MONGO_DATASET1_COLLECTION: str = os.getenv(
        "MONGO_DATASET1_COLLECTION",
        "dataset1_logs",
    )
    MONGO_DATASET2_COLLECTION: str = os.getenv(
        "MONGO_DATASET2_COLLECTION",
        "dataset2_logs",
    )

    MONGO_URI: str = os.getenv(
        "MONGO_URI", "mongodb://admin:mongodb123@localhost:27017"
    )
    MONGO_DATABASE_NAME: str = os.getenv("MONGO_DATABASE_NAME", "resource_logs")
    MONGO_DATASET1_COLLECTION: str = os.getenv(
        "MONGO_DATASET1_COLLECTION", "dataset1_logs"
    )
    MONGO_DATASET2_COLLECTION: str = os.getenv(
        "MONGO_DATASET2_COLLECTION", "dataset2_logs"
    )

    MONGO_SAVEDLOGS_DATABASE_NAME: str = os.getenv(
        "MONGO_SAVEDLOGS_DATABASE_NAME", "savedlogs"
    )
    MONGO_SAVEDLOGS_COLLECTION: str = os.getenv(
        "MONGO_SAVEDLOGS_COLLECTION", "saved_logs"
    )

    DATASET_COLLECTION_MAP: dict[str, str] = {
        "DATASET1": MONGO_DATASET1_COLLECTION,
        "DATASET2": MONGO_DATASET2_COLLECTION,
    }


settings = Settings()
