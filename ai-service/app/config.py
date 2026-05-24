import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "ai-service")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

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

    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", "data/chat_history.db")

    # Ollama — free local LLM (no API key needed)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")

    CORS_ALLOW_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
        if origin.strip()
    ]

    DATASET_COLLECTION_MAP: dict[str, str] = {
        "DATASET1": MONGO_DATASET1_COLLECTION,
        "DATASET2": MONGO_DATASET2_COLLECTION,
    }


settings = Settings()
