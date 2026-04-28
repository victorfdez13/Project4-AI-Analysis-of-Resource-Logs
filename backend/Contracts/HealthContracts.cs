namespace Project4_AI_Analysis_of_Resource_Logs.Contracts;

public sealed record DependencyHealthResponse(
    bool IsHealthy,
    string Status,
    SqlServerHealth SqlServer,
    MongoDbHealth MongoDb);

public sealed record SqlServerHealth(
    bool IsHealthy,
    string Status,
    IReadOnlyList<DatasetHealth> Datasets,
    string? Error);

public sealed record DatasetHealth(
    string Dataset,
    bool IsAvailable,
    string? Error);

public sealed record MongoDbHealth(
    bool IsHealthy,
    string Status,
    string DatabaseName,
    string CollectionName,
    string? Error);

public sealed record AiServiceHealth(
    bool IsHealthy,
    string Status,
    string BaseUrl,
    string? Error);
