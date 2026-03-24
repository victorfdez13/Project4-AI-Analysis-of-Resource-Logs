using Microsoft.Data.SqlClient;
using MongoDB.Bson;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.MapGet("/health/database", async (IConfiguration configuration, CancellationToken cancellationToken) =>
{
    var sqlConnectionString = configuration.GetConnectionString("SqlServer");
    var mongoConnectionString = configuration.GetConnectionString("MongoDb");
    var mongoDatabaseName = configuration["MongoSettings:DatabaseName"];
    var sqlDatasetNames = configuration.GetSection("SqlServerDatasets").Get<string[]>() ?? [];

    if (string.IsNullOrWhiteSpace(sqlConnectionString) ||
        string.IsNullOrWhiteSpace(mongoConnectionString) ||
        string.IsNullOrWhiteSpace(mongoDatabaseName) ||
        sqlDatasetNames.Length == 0)
    {
        return Results.Problem(
            title: "Database configuration is incomplete.",
            detail: "Set SqlServer, MongoDb, MongoSettings:DatabaseName, and SqlServerDatasets before calling this endpoint.",
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var sqlStatus = await CheckSqlServerAsync(sqlConnectionString, sqlDatasetNames, cancellationToken);
    var mongoStatus = await CheckMongoAsync(mongoConnectionString, mongoDatabaseName, cancellationToken);

    var overallStatusCode = sqlStatus.IsHealthy && mongoStatus.IsHealthy
        ? StatusCodes.Status200OK
        : StatusCodes.Status503ServiceUnavailable;

    return Results.Json(new
    {
        sqlServer = sqlStatus,
        mongoDb = mongoStatus
    }, statusCode: overallStatusCode);
});

app.Run();

static async Task<DatabaseStatus> CheckSqlServerAsync(
    string connectionString,
    IReadOnlyCollection<string> datasetNames,
    CancellationToken cancellationToken)
{
    try
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        const string query = """
            SELECT name
            FROM sys.databases
            WHERE name IN (@dataset1, @dataset2);
            """;

        await using var command = new SqlCommand(query, connection);
        var datasetArray = datasetNames.ToArray();
        for (var i = 0; i < datasetArray.Length; i++)
        {
            command.Parameters.AddWithValue($"@dataset{i + 1}", datasetArray[i]);
        }

        var discoveredDatasets = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            discoveredDatasets.Add(reader.GetString(0));
        }

        var missingDatasets = datasetArray.Except(discoveredDatasets, StringComparer.OrdinalIgnoreCase).ToArray();
        if (missingDatasets.Length > 0)
        {
            return new DatabaseStatus(false, $"Missing SQL Server datasets: {string.Join(", ", missingDatasets)}.");
        }

        return new DatabaseStatus(true, $"Connected to SQL Server. Datasets available: {string.Join(", ", discoveredDatasets)}.");
    }
    catch (Exception ex)
    {
        return new DatabaseStatus(false, ex.Message);
    }
}

static async Task<DatabaseStatus> CheckMongoAsync(
    string connectionString,
    string databaseName,
    CancellationToken cancellationToken)
{
    try
    {
        var client = new MongoClient(connectionString);
        var database = client.GetDatabase(databaseName);
        await database.RunCommandAsync<BsonDocument>(
            new BsonDocument("ping", 1),
            cancellationToken: cancellationToken);

        var collectionNames = await database.ListCollectionNames().ToListAsync(cancellationToken);
        return new DatabaseStatus(
            true,
            $"Connected to MongoDB database '{databaseName}'. Collections available: {string.Join(", ", collectionNames)}.");
    }
    catch (Exception ex)
    {
        return new DatabaseStatus(false, ex.Message);
    }
}

record DatabaseStatus(bool IsHealthy, string Message);
