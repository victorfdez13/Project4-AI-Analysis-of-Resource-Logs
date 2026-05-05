# AI Service

Small Python microservice (FastAPI) for the SpeedAdmin log analysis project.

It reads real SpeedAdmin logs from MongoDB, runs a simple deterministic
rule-based algorithm on them, and stores the results in a separate MongoDB
database called `savedlogs`.

There is no LLM call and no API key required.

## Requirements

- Python 3.11 or compatible
- pip
- MongoDB running with the `resource_logs` database populated
  (see `database/scripts/setup-datasets.ps1`)

## Install dependencies

```bash
pip install -r requirements.txt
```

## Run locally

1. Copy `.env.example` to `.env` and adjust `MONGO_URI` if needed.
2. Start the service:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The service will be available at `http://localhost:8000`.

## Run with Docker

```bash
docker build -t ai-service .
docker run -p 8000:8000 --env-file .env ai-service
```

## Databases used

| Purpose | Database       | Collection(s)                      |
| ------- | -------------- | ---------------------------------- |
| Input   | `resource_logs`| `dataset1_logs`, `dataset2_logs`   |
| Output  | `savedlogs`    | `saved_logs`                       |

The dataset query parameter accepts `DATASET1` or `DATASET2`.

## Endpoints

### `GET /health`

Returns `{"status": "ok"}`.

### `POST /analyze`

Backwards-compatible endpoint used by the .NET backend. Accepts the legacy
payload shape; if `metadata.dataset` and `metadata.logId` are present, the
result is also saved into `savedlogs.saved_logs`.

### `GET /logs/{log_id}?dataset=DATASET1`

Returns the real SpeedAdmin log from MongoDB.

### `POST /logs/{log_id}/analyze?dataset=DATASET1`

Looks up the real log, runs the rule-based algorithm, upserts the result into
`savedlogs.saved_logs` keyed by `(dataset, logId)`, and returns the saved
document.

### `GET /saved-logs?dataset=DATASET1&limit=50`

Lists saved analyses, newest first. `dataset` and `limit` are optional
(default limit is 50, max 500).

### `GET /saved-logs/{log_id}?dataset=DATASET1`

Returns one saved analysis by `(dataset, logId)`.

## Algorithm

`app/service.py` runs a small deterministic algorithm against the real
SpeedAdmin fields (`category`, `level`, `message`, `mainEntityId`,
`impersonatorMainEntityId`, `sessionId`, `entities`, `changes`) and produces:

- `summary` — short human-readable line
- `explanation` — why/what happened, based on the fields
- `anomalies` — simple flags (impersonation, unexpected level, missing
  sessionId on login events, empty message, etc.)
- `related_resources` — entity / session references useful for follow-up

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

- The service does **not** connect to SQL Server.
- No LLM is called; no API key is required.
- The analysis is intentionally simple and easy to extend.
