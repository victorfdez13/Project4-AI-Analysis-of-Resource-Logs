# Database setup

This project uses SQL Server and MongoDB in Docker containers and loads the real datasets from an external archive.

## Source archive

Default archive path:

```text
C:\Users\victo\Downloads\datasets.tar
```

The archive is extracted to `database/.cache/`, which is ignored by Git.

## Full setup

```powershell
powershell -ExecutionPolicy Bypass -File .\database\scripts\setup-datasets.ps1
```

Optional custom archive path:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\scripts\setup-datasets.ps1 -ArchivePath "D:\data\datasets.tar"
```

What the script does:

- extracts `DATASET1` and `DATASET2` outside Git
- starts SQL Server and MongoDB
- imports all SQL scripts into SQL Server databases `DATASET1` and `DATASET2`
- exports the log datasets from SQL Server and imports them into MongoDB collections `dataset1_logs` and `dataset2_logs`

## Stop services

```powershell
docker compose -f database/docker-compose.yml down
```

## Reset persisted data

```powershell
docker compose -f database/docker-compose.yml down -v
Remove-Item -Recurse -Force .\database\.cache\*
```

## Default local connections

- SQL Server: `Server=localhost,1433;Database=master;User Id=sa;Password=Your_strong_password123;TrustServerCertificate=True;`
- MongoDB: `mongodb://admin:mongodb123@localhost:27017`
- SQL datasets expected: `DATASET1`, `DATASET2`
- Mongo collections expected: `dataset1_logs`, `dataset2_logs`

## Verify from backend

Run the API and call:

```text
GET /health/database
```
