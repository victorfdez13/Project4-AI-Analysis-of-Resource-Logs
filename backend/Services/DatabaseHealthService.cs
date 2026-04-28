using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public sealed class DatabaseHealthService
{
    private readonly SqlLogRepository _sqlLogRepository;
    private readonly IMongoClient _mongoClient;
    private readonly BackendOptions _options;

    public DatabaseHealthService(
        SqlLogRepository sqlLogRepository,
        IMongoClient mongoClient,
        IOptions<BackendOptions> options)
    {
        _sqlLogRepository = sqlLogRepository;
        _mongoClient = mongoClient;
        _options = options.Value;
    }

    public async Task<DependencyHealthResponse> CheckAsync(CancellationToken cancellationToken)
    {
        var sqlHealth = await _sqlLogRepository.CheckHealthAsync(cancellationToken);
        var mongoHealth = await CheckMongoAsync(cancellationToken);

        var isHealthy = sqlHealth.IsHealthy && mongoHealth.IsHealthy;
        return new DependencyHealthResponse(
            isHealthy,
            isHealthy ? "ok" : "unavailable",
            sqlHealth,
            mongoHealth);
    }

    private async Task<MongoDbHealth> CheckMongoAsync(CancellationToken cancellationToken)
    {
        try
        {
            var database = _mongoClient.GetDatabase(_options.MongoSettings.DatabaseName);

            await database.RunCommandAsync<BsonDocument>(
                new BsonDocument("ping", 1),
                cancellationToken: cancellationToken);

            var collectionNames = await database.ListCollectionNames().ToListAsync(cancellationToken);
            var hasCollection = collectionNames.Contains(
                _options.MongoSettings.CollectionName,
                StringComparer.OrdinalIgnoreCase);

            return new MongoDbHealth(
                hasCollection,
                hasCollection ? "ok" : "unavailable",
                _options.MongoSettings.DatabaseName,
                _options.MongoSettings.CollectionName,
                hasCollection ? null : "Expected MongoDB collection was not found.");
        }
        catch (Exception exception)
        {
            return new MongoDbHealth(
                false,
                "unavailable",
                _options.MongoSettings.DatabaseName,
                _options.MongoSettings.CollectionName,
                exception.Message);
        }
    }
}
