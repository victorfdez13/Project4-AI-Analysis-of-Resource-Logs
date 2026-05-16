# SpeedAdmin Log Analysis

AI-assisted log analysis for SpeedAdmin school-management resource logs. See the project proposal for context, architecture and requirements.

## Components

| Container   | Tech              | Port (host) | Purpose                                                            |
| ----------- | ----------------- | ----------- | ------------------------------------------------------------------ |
| `frontend`  | React + Vite      | 5173        | UI: dashboard, saved logs, chat                                    |
| `backend`   | ASP.NET (C#) 9    | 5005        | Orchestrates SQL retrieval, context construction and AI calls      |
| `ai-service`| Python FastAPI    | 8000        | Builds prompt + context, calls LLM, persists saved analyses        |
| `sqlserver` | MS SQL Server 2022| 1433        | Real SpeedAdmin log datasets (`DATASET1`, `DATASET2`)              |
| `mongo`     | MongoDB 7.0       | 27017       | Saved analyses, chat history                                       |

The browser only talks to `backend`. `backend` calls `ai-service` server-to-server. `ai-service` reads from `mongo` (and the LLM provider, when configured).

## Run the full stack

```powershell
docker compose up --build
```

First build is slow (downloads SQL Server and SDK base images). Subsequent runs reuse the cache.

Once everything is healthy:

- UI: <http://localhost:5173>
- Backend API: <http://localhost:5005>
- AI service: <http://localhost:8000>
- SQL Server: `localhost,1433`
- MongoDB: `mongodb://admin:mongodb123@localhost:27017`

Stop:

```powershell
docker compose down
```

Wipe database volumes (deletes all saved data):

```powershell
docker compose down -v
```

## Loading the SpeedAdmin datasets

The full compose stack only starts empty databases. To load the real SpeedAdmin datasets into SQL Server (and mirror them into MongoDB), run the existing script — see [`database/README.md`](database/README.md).

Quick path on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\scripts\setup-datasets.ps1
```

The script targets the local `localhost,1433` / `27017` ports exposed by either `docker-compose.yml` (full stack) or `database/docker-compose.yml` (DBs only).

## Running services individually

Sometimes you only want to work on one component. Two common cases:

- **DBs only, app on host**: `docker compose -f database/docker-compose.yml up -d` and run the backend / ai-service / frontend from your IDE.
- **Everything except one**: `docker compose up --build sqlserver mongo ai-service backend` (skips the frontend container; run `npm run dev` in `frontend/` instead).

## LLM configuration (optional)

The ai-service uses a three-tier fallback: OpenAI → Ollama (local) → smart mock. Out of the box it falls back to the mock so the stack runs without any API key.

To enable a real LLM, copy `ai-service/.env.example` to `ai-service/.env` and set either `LLM_API_KEY` (OpenAI) or run a local Ollama instance and adjust `OLLAMA_BASE_URL`. The compose file passes the relevant env vars through to the container.

## Useful commands

```powershell
# tail logs from one service
docker compose logs -f backend

# rebuild a single service after code changes
docker compose up --build backend

# open a shell inside a running container
docker compose exec backend bash
```
