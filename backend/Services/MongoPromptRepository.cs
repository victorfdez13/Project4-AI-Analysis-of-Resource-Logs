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
    }

    public async Task SaveAnalysisAsync(
        string dataset,
        int logId,
        ResourceLogDetail log,
        AiAnalyzeResponse analysis,
        CancellationToken cancellationToken)
    {
        var document = new BsonDocument
        {
            ["dataset"] = dataset,
            ["logId"] = logId,
            ["analyzedAt"] = DateTimeOffset.UtcNow.ToString("o"),
            ["originalLog"] = new BsonDocument
            {
                ["logId"] = log.LogId,
                ["category"] = log.Category,
                ["time"] = log.Time.ToString("o"),
                ["message"] = log.Message,
                ["level"] = log.Level,
                ["mainEntityId"] = log.MainEntityId != null ? (BsonValue)log.MainEntityId : BsonNull.Value,
                ["sessionId"] = log.SessionId != null ? (BsonValue)log.SessionId : BsonNull.Value,
            },
            ["analysis"] = new BsonDocument
            {
                ["summary"] = analysis.Summary,
                ["explanation"] = analysis.Explanation,
                ["anomalies"] = new BsonArray(analysis.Anomalies),
                ["relatedResources"] = new BsonArray(analysis.RelatedResources),
            }
        };

        // Upsert — replace existing result for same dataset + logId
        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Eq("dataset", dataset),
            Builders<BsonDocument>.Filter.Eq("logId", logId));

        await _collection.ReplaceOneAsync(
            filter,
            document,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
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
            .FirstOrDefaultAsync(cancellationToken);

        if (document is null)
            return null;

        var analysisDoc = document["analysis"].AsBsonDocument;
        var analysis = new AiAnalyzeResponse(
            analysisDoc["summary"].AsString,
            analysisDoc["explanation"].AsString,
            analysisDoc["anomalies"].AsBsonArray.Select(x => x.AsString).ToList(),
            analysisDoc["relatedResources"].AsBsonArray.Select(x => x.AsString).ToList());

        return new SavedAnalysisResult(
            document["_id"].ToString()!,
            dataset,
            logId,
            document["analyzedAt"].AsString,
            analysis);
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

        return documents.Select(document =>
        {
            var analysisDoc = document["analysis"].AsBsonDocument;
            var analysis = new AiAnalyzeResponse(
                analysisDoc["summary"].AsString,
                analysisDoc["explanation"].AsString,
                analysisDoc["anomalies"].AsBsonArray.Select(x => x.AsString).ToList(),
                analysisDoc["relatedResources"].AsBsonArray.Select(x => x.AsString).ToList());

            return new SavedAnalysisResult(
                document["_id"].ToString()!,
                dataset,
                document["logId"].ToInt32(),
                document["analyzedAt"].AsString,
                analysis);
        }).ToList();
    }
}