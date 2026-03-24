param(
    [string]$ArchivePath = "C:\Users\victo\Downloads\datasets.tar",
    [string]$SqlPassword = "Your_strong_password123",
    [string]$MongoRootUser = "admin",
    [string]$MongoRootPassword = "mongodb123"
)

$ErrorActionPreference = "Stop"

$databaseRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $databaseRoot
$composeFile = Join-Path $databaseRoot "docker-compose.yml"
$cacheRoot = Join-Path $databaseRoot ".cache"
$extractRoot = Join-Path $cacheRoot "datasets"
$mongoImportRoot = Join-Path $cacheRoot "mongo-import"
$sqlContainer = "project4-sqlserver"
$mongoContainer = "project4-mongo"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not installed or not available in PATH."
    }
}

function Wait-ForContainerHealthy([string]$ContainerName, [int]$TimeoutSeconds = 240) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $status = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $ContainerName 2>$null
        if ($LASTEXITCODE -eq 0 -and $status -eq "healthy") {
            return
        }

        if ($LASTEXITCODE -eq 0 -and $status -eq "running") {
            return
        }

        Start-Sleep -Seconds 5
    }

    throw "Container '$ContainerName' did not become healthy in time."
}

function Invoke-SqlScriptFolder([string]$DatasetName, [string]$FolderPath) {
    $checkQuery = "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE name = '$DatasetName';"
    $existing = docker exec $sqlContainer /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $SqlPassword -C -h -1 -W -Q $checkQuery
    if ($existing -match $DatasetName) {
        Write-Host "SQL dataset $DatasetName already exists. Skipping import."
        return
    }

    $containerFolder = "/tmp/$DatasetName"
    docker exec $sqlContainer /bin/bash -c "rm -rf $containerFolder && mkdir -p $containerFolder" | Out-Null
    docker cp "$FolderPath\." "$sqlContainer`:$containerFolder" | Out-Null

    $files = Get-ChildItem -Path $FolderPath -Filter "*.sql" | Sort-Object Name
    foreach ($file in $files) {
        $containerFile = "$containerFolder/$($file.Name)"
        Write-Host "Running $DatasetName -> $($file.Name)"
        docker exec $sqlContainer /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $SqlPassword -C -i $containerFile | Out-Null
    }
}

function Export-SqlLogsToJson([string]$DatasetName) {
    $query = @"
SET NOCOUNT ON;
SELECT
    '$DatasetName' AS datasetName,
    l.LogId AS logId,
    l.Category AS category,
    l.[Time] AS [time],
    l.Message AS message,
    l.MainEntityId AS mainEntityId,
    l.ImpersonatorMainEntityId AS impersonatorMainEntityId,
    l.SessionId AS sessionId,
    l.Level AS [level],
    JSON_QUERY((
        SELECT
            lc.LogChangeId AS logChangeId,
            lc.PropertyName AS propertyName,
            lc.PreviousValue AS previousValue,
            lc.NewValue AS newValue,
            lc.Message AS message
        FROM [$DatasetName].[dbo].[LogChange] lc
        WHERE lc.LogId = l.LogId
        FOR JSON PATH
    )) AS changes,
    JSON_QUERY((
        SELECT
            le.LogEntityId AS logEntityId,
            le.EntityType AS entityType,
            le.EntityId AS entityId
        FROM [$DatasetName].[dbo].[LogEntity] le
        WHERE le.LogId = l.LogId
        FOR JSON PATH
    )) AS entities
FROM [$DatasetName].[dbo].[Log] l
FOR JSON PATH;
"@

    $json = docker exec $sqlContainer /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $SqlPassword -C -h -1 -W -y 0 -Y 0 -Q $query
    if (-not $json) {
        throw "No JSON export returned for $DatasetName."
    }

    $normalized = ($json | Where-Object { $_ -and $_.Trim() -ne "" }) -join "`n"
    $outputFile = Join-Path $mongoImportRoot "$($DatasetName.ToLowerInvariant())_logs.json"
    Set-Content -Path $outputFile -Value $normalized -Encoding UTF8
    return $outputFile
}

function Import-JsonFileToMongo([string]$DatabaseName, [string]$CollectionName, [string]$JsonFile) {
    $containerJson = "/tmp/$CollectionName.json"
    $containerScript = "/tmp/import-$CollectionName.js"

    $mongoScript = @"
const fs = require('fs');
const dbName = '$DatabaseName';
const collectionName = '$CollectionName';
const filePath = '$containerJson';
const raw = fs.readFileSync(filePath, 'utf8').trim();
const docs = raw ? JSON.parse(raw) : [];
const targetDb = db.getSiblingDB(dbName);
try {
  targetDb.getCollection(collectionName).drop();
} catch (err) {
}
if (docs.length > 0) {
  targetDb.getCollection(collectionName).insertMany(docs, { ordered: false });
} else {
  targetDb.createCollection(collectionName);
}
"@

    $localScript = Join-Path $mongoImportRoot "import-$CollectionName.js"
    Set-Content -Path $localScript -Value $mongoScript -Encoding UTF8

    docker cp $JsonFile "$mongoContainer`:$containerJson" | Out-Null
    docker cp $localScript "$mongoContainer`:$containerScript" | Out-Null
    docker exec $mongoContainer mongosh --quiet --username $MongoRootUser --password $MongoRootPassword --authenticationDatabase admin --file $containerScript | Out-Null
}

Require-Command "docker"
Require-Command "tar"

if (-not (Test-Path $ArchivePath)) {
    throw "Archive not found: $ArchivePath"
}

New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
New-Item -ItemType Directory -Force -Path $mongoImportRoot | Out-Null

Write-Host "Extracting datasets to $extractRoot"
tar -xf $ArchivePath -C $extractRoot

Write-Host "Starting SQL Server and MongoDB containers"
docker compose -f $composeFile up -d sqlserver mongo | Out-Null

Wait-ForContainerHealthy -ContainerName $sqlContainer
Wait-ForContainerHealthy -ContainerName $mongoContainer

Invoke-SqlScriptFolder -DatasetName "DATASET1" -FolderPath (Join-Path $extractRoot "DATASET1")
Invoke-SqlScriptFolder -DatasetName "DATASET2" -FolderPath (Join-Path $extractRoot "DATASET2")

$dataset1Json = Export-SqlLogsToJson -DatasetName "DATASET1"
$dataset2Json = Export-SqlLogsToJson -DatasetName "DATASET2"

Import-JsonFileToMongo -DatabaseName "resource_logs" -CollectionName "dataset1_logs" -JsonFile $dataset1Json
Import-JsonFileToMongo -DatabaseName "resource_logs" -CollectionName "dataset2_logs" -JsonFile $dataset2Json

Write-Host "Datasets imported into SQL Server and MongoDB."
