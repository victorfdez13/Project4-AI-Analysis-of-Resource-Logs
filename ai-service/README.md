# AI Service

This is a simple Python microservice built with FastAPI for a university project.

Its purpose is to provide a small and clear base for future AI-related features. Right now, it returns mock AI responses and can fetch real logs from MongoDB. It does not include real AI logic or authentication.

## Requirements

- Python 3.11 or compatible
- pip

## Install dependencies

```bash
pip install -r requirements.txt
```

## Run locally

1. Create a `.env` file based on `.env.example`.
2. Make sure MongoDB is running with the imported resource log collections.
3. Start the service:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The service will be available at `http://localhost:8000`.

## Run with Docker

Build the image:

```bash
docker build -t ai-service .
```

Run the container:

```bash
docker run -p 8000:8000 --env-file .env ai-service
```

## Available endpoints

### `GET /health`

Response:

```json
{
  "status": "ok"
}
```

### `POST /analyze`

Request:

```json
{
  "resource_id": "res-123",
  "log_text": "Error connecting to database",
  "timestamp": "2025-01-01T10:00:00",
  "metadata": {
    "source": "system"
  }
}
```

Response:

```json
{
  "summary": "Placeholder summary for provided log",
  "explanation": "This is a mock explanation. AI logic not implemented yet.",
  "anomalies": [],
  "related_resources": []
}
```

### `GET /logs/{log_id}?dataset=DATASET1`

Fetches one real log from MongoDB by `logId`.

Supported datasets:

- `DATASET1`
- `DATASET2`

Example:

```bash
curl "http://localhost:8000/logs/1?dataset=DATASET1"
```

## Notes

- This service is intentionally simple.
- Real AI logic is not implemented yet.
- It reads logs from MongoDB only. It does not connect to SQL Server.
