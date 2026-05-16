using System.Text.Json;
using System.Text.Json.Serialization;

namespace Project4_AI_Analysis_of_Resource_Logs.Contracts;

public sealed record ResourceLogSummary(
    string Dataset,
    int LogId,
    string Category,
    DateTimeOffset Time,
    string Message,
    string Level,
    string? MainEntityId,
    string? ImpersonatorMainEntityId,
    string? SessionId);

public sealed record ResourceLogDetail(
    string Dataset,
    int LogId,
    string Category,
    DateTimeOffset Time,
    string Message,
    string Level,
    string? MainEntityId,
    string? ImpersonatorMainEntityId,
    string? SessionId,
    IReadOnlyList<LogChangeDetail> Changes,
    IReadOnlyList<LogEntityDetail> Entities);

public sealed record LogChangeDetail(
    string? LogChangeId,
    string? PropertyName,
    string? PreviousValue,
    string? NewValue,
    string? Message);

public sealed record LogEntityDetail(
    string? LogEntityId,
    string? EntityType,
    string? EntityId);

public sealed record LogListResponse(
    string Dataset,
    int Skip,
    int Take,
    int TotalCount,
    IReadOnlyList<ResourceLogSummary> Items);

public sealed record LogAnalysisResponse(
    ResourceLogDetail Log,
    AiAnalyzeResponse Analysis);

public sealed record AiAnalyzeRequest(
    [property: JsonPropertyName("resource_id")] string ResourceId,
    [property: JsonPropertyName("log_text")] string LogText,
    [property: JsonPropertyName("timestamp")] DateTimeOffset Timestamp,
    [property: JsonPropertyName("metadata")] IReadOnlyDictionary<string, object?> Metadata);

public sealed record AiAnalyzeResponse(
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("explanation")] string Explanation,
    [property: JsonPropertyName("anomalies")] IReadOnlyList<string> Anomalies,
    [property: JsonPropertyName("related_resources")] IReadOnlyList<string> RelatedResources);

public sealed record SavedLogDocument(
    [property: JsonPropertyName("_id")] string? Id,
    [property: JsonPropertyName("dataset")] string Dataset,
    [property: JsonPropertyName("logId")] int? LogId,
    [property: JsonPropertyName("prompt")] string? Prompt,
    [property: JsonPropertyName("analyzedAt")] string? AnalyzedAt,
    [property: JsonPropertyName("originalLog")] JsonElement? OriginalLog,
    [property: JsonPropertyName("analysis")] AiAnalyzeResponse? Analysis);
