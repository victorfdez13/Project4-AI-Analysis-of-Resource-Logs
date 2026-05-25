import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "python-ai-lab")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8010"))
    EXPLANATION_BACKEND: str = os.getenv("EXPLANATION_BACKEND", "template")
    REMOTE_LLM_BASE_URL: str = os.getenv("REMOTE_LLM_BASE_URL", "")
    REMOTE_LLM_MODEL: str = os.getenv("REMOTE_LLM_MODEL", "")
    REMOTE_LLM_API_KEY: str = os.getenv("REMOTE_LLM_API_KEY", "")
    REMOTE_LLM_SYSTEM_PROMPT: str = os.getenv(
        "REMOTE_LLM_SYSTEM_PROMPT",
        "You explain SpeedAdmin logs in plain language for support staff and customers.",
    )
    REMOTE_LLM_TIMEOUT_SECONDS: int = int(
        os.getenv("REMOTE_LLM_TIMEOUT_SECONDS", "10")
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
