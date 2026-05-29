using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public sealed class MongoPromptRepository
{
    private readonly IMongoCollection<BsonDocument> _collection;

    public MongoPromptRepository(IMongoClient mongoClient, IOptions<BackendOptions> options)
    {
        var database = mongoClient.GetDatabase(options.Value.MongoSettings.DatabaseName);
        _collection = database.GetCollection<BsonDocument>(options.Value.MongoSettings.CollectionName);
        EnsureIndexes();
    }

    private void EnsureIndexes()
    {
        var existingIndexNames = _collection
            .Indexes
            .List()
            .ToList()
            .Select(document => document.GetValue("name", string.Empty).AsString)
            .ToHashSet(StringComparer.Ordinal);

        if (existingIndexNames.Contains("dataset_logId_unique"))
        {
            _collection.Indexes.DropOne("dataset_logId_unique");
        }

        _collection.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys
                    .Ascending("analysisId"),
                new CreateIndexOptions
                {
                    Name = "analysisId_unique",
                    Unique = true
                }),
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys
                    .Ascending("createdByUserId")
                    .Descending("analyzedAt"),
                new CreateIndexOptions
                {
                    Name = "createdByUserId_analyzedAt"
                }),
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys
                    .Ascending("dataset")
                    .Descending("analyzedAt"),
                new CreateIndexOptions
                {
                    Name = "dataset_analyzedAt"
                }),
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys
                    .Ascending("dataset")
                    .Ascending("logId"),
                new CreateIndexOptions
                {
                    Name = "dataset_logId"
                }),
        });
    }

    public async Task SaveAnalysisAsync(
        string dataset,
        int logId,
        ResourceLogDetail log,
        AiAnalyzeResponse analysis,
        string userId,
        string role,
        bool sharedWithSupport,
        string? prompt,
        IReadOnlyList<ResourceLogDetail>? selectedLogs,
        IReadOnlyDictionary<string, object?>? activeFilters,
        CancellationToken cancellationToken)
    {
        var selectedLogDocuments = BuildSelectedLogArray(log, selectedLogs);
        var document = new BsonDocument
        {
            ["createdByUserId"] = userId,
            ["createdByRole"] = role,
            ["sharedWithSupport"] = sharedWithSupport,
            ["analysisId"] = Guid.NewGuid().ToString(),
            ["analysisName"] = $"Analysis-{log.LogId}",
            ["dataset"] = dataset,
            ["logId"] = logId,
            ["prompt"] = prompt ?? "",
            ["analyzedAt"] = DateTimeOffset.UtcNow.ToString("o"),
            ["selectedLogs"] = selectedLogDocuments,
            ["analysis"] = new BsonDocument
            {
                ["summary"] = analysis.Summary,
                ["explanation"] = analysis.Explanation,
                ["anomalies"] = new BsonArray(analysis.Anomalies),
                ["pointsOfInterest"] = new BsonArray(analysis.PointsOfInterest),
                ["relatedResources"] = new BsonArray(analysis.RelatedResources ?? []),
            }
        };

        if (activeFilters is { Count: > 0 })
        {
            document["activeFilters"] = BuildFiltersDocument(activeFilters);
        }

        await _collection.InsertOneAsync(
            document,
            cancellationToken: cancellationToken);
    }

    public async Task<SavedAnalysisResult?> GetAnalysisAsync(
        string dataset,
        int logId,
        CancellationToken cancellationToken)
    {
        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Eq("dataset", dataset),
            Builders<BsonDocument>.Filter.Eq("logId", logId));

        var document = await _collection
            .Find(filter)
            .SortByDescending(d => d["analyzedAt"])
            .FirstOrDefaultAsync(cancellationToken);

        if (document is null)
            return null;

        return MapDocument(document);
    }

    public async Task<IReadOnlyList<SavedAnalysisResult>> ListAnalysesAsync(
        string dataset,
        int limit,
        CancellationToken cancellationToken)
    {
        var filter = Builders<BsonDocument>.Filter.Eq("dataset", dataset);

        var documents = await _collection
            .Find(filter)
            .SortByDescending(d => d["analyzedAt"])
            .Limit(limit)
            .ToListAsync(cancellationToken);

        return documents.Select(MapDocument).ToList();
    }

    private static BsonArray BuildSelectedLogArray(
        ResourceLogDetail anchorLog,
        IReadOnlyList<ResourceLogDetail>? selectedLogs)
    {
        var seenLogIds = new HashSet<int>();
        var orderedLogs = new List<ResourceLogDetail> { anchorLog };

        if (selectedLogs is { Count: > 0 })
        {
            orderedLogs.AddRange(selectedLogs);
        }

        var documents = new BsonArray();
        foreach (var log in orderedLogs)
        {
            if (!seenLogIds.Add(log.LogId))
            {
                continue;
            }

            documents.Add(new BsonDocument
            {
                ["dataset"] = log.Dataset,
                ["logId"] = log.LogId,
                ["category"] = log.Category,
                ["time"] = log.Time.ToString("o"),
                ["message"] = log.Message,
                ["level"] = log.Level,
                ["mainEntityId"] = log.MainEntityId != null ? (BsonValue)log.MainEntityId : BsonNull.Value,
                ["impersonatorMainEntityId"] = log.ImpersonatorMainEntityId != null ? (BsonValue)log.ImpersonatorMainEntityId : BsonNull.Value,
                ["sessionId"] = log.SessionId != null ? (BsonValue)log.SessionId : BsonNull.Value,
            });
        }

        return documents;
    }

    private static BsonDocument BuildFiltersDocument(IReadOnlyDictionary<string, object?> activeFilters)
    {
        var document = new BsonDocument();
        foreach (var (key, value) in activeFilters)
        {
            document[key] = value is null
                ? BsonNull.Value
                : BsonTypeMapper.MapToBsonValue(value);
        }

        return document;
    }

    private static SavedAnalysisResult MapDocument(BsonDocument document)
    {
        var analysisDoc = document["analysis"].AsBsonDocument;
        var selectedLogs = document.Contains("selectedLogs")
            ? document["selectedLogs"]
                .AsBsonArray
                .Select(MapSelectedLog)
                .ToList()
            : null;

        var pointsOfInterest = analysisDoc.Contains("pointsOfInterest")
            ? analysisDoc["pointsOfInterest"].AsBsonArray.Select(x => x.AsString).ToList()
            : (IReadOnlyList<string>)[];

        var relatedResources = analysisDoc.Contains("relatedResources")
            ? analysisDoc["relatedResources"].AsBsonArray.Select(x => x.AsString).ToList()
            : (IReadOnlyList<string>)[];

        var analysis = new AiAnalyzeResponse(
            analysisDoc["summary"].AsString,
            analysisDoc["explanation"].AsString,
            analysisDoc["anomalies"].AsBsonArray.Select(x => x.AsString).ToList(),
            pointsOfInterest,
            relatedResources);

        return new SavedAnalysisResult(
            document.Contains("analysisId") ? document["analysisId"].AsString : document["_id"].ToString()!,
            document["dataset"].AsString,
            document["logId"].ToInt32(),
            document["analyzedAt"].AsString,
            document.Contains("prompt") ? document["prompt"].AsString : null,
            analysis,
            selectedLogs);
    }

    private static ResourceLogSummary MapSelectedLog(BsonValue value)
    {
        var document = value.AsBsonDocument;
        var time = DateTimeOffset.TryParse(document.GetValue("time", string.Empty).AsString, out var parsedTime)
            ? parsedTime
            : DateTimeOffset.MinValue;

        return new ResourceLogSummary(
            document.GetValue("dataset", string.Empty).AsString,
            document.GetValue("logId", -1).ToInt32(),
            document.GetValue("category", string.Empty).AsString,
            time,
            document.GetValue("message", string.Empty).AsString,
            document.GetValue("level", string.Empty).AsString,
            document.TryGetValue("mainEntityId", out var mainEntityId) && !mainEntityId.IsBsonNull ? mainEntityId.AsString : null,
            document.TryGetValue("impersonatorMainEntityId", out var impersonatorId) && !impersonatorId.IsBsonNull ? impersonatorId.AsString : null,
            document.TryGetValue("sessionId", out var sessionId) && !sessionId.IsBsonNull ? sessionId.AsString : null);
    }

    public async Task<IReadOnlyList<BsonDocument>> GetUserHistoryAsync(
        string userId,
        CancellationToken cancellationToken)
    {
        var filter = Builders<BsonDocument>.Filter.Eq(
            "createdByUserId",
            userId);

        var documents = await _collection
            .Find(filter)
            .SortByDescending(d => d["analyzedAt"])
            .ToListAsync(cancellationToken);

        return documents;
    }

}
