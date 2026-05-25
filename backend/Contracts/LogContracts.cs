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

public sealed record LogLevelCount(
    string Level,
    int Count);

public sealed record DatasetSummaryResponse(
    string Dataset,
    int TotalCount,
    int DistinctCategoryCount,
    string? TopCategory,
    int SessionCount,
    int ImpersonatedCount,
    DateTimeOffset? EarliestTime,
    DateTimeOffset? LatestTime,
    IReadOnlyList<LogLevelCount> Levels);


public sealed record AiAnalyzeRequest(
    [property: JsonPropertyName("resource_id")] string ResourceId,
    [property: JsonPropertyName("log_text")] string LogText,
    [property: JsonPropertyName("timestamp")] DateTimeOffset Timestamp,
    [property: JsonPropertyName("metadata")] IReadOnlyDictionary<string, object?> Metadata);

public sealed record AiAnalyzeResponse(
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("explanation")] string Explanation,
    [property: JsonPropertyName("anomalies")] IReadOnlyList<string> Anomalies,
    [property: JsonPropertyName("points_of_interest")] IReadOnlyList<string> PointsOfInterest,
    [property: JsonPropertyName("related_resources")] IReadOnlyList<string>? RelatedResources = null);

public sealed record PythonContextOverview(
    [property: JsonPropertyName("dataset")] string? Dataset,
    [property: JsonPropertyName("requested_log_id")] int? RequestedLogId,
    [property: JsonPropertyName("selected_log_count")] int SelectedLogCount,
    [property: JsonPropertyName("linked_log_count")] int LinkedLogCount,
    [property: JsonPropertyName("filtered_log_count")] int FilteredLogCount,
    [property: JsonPropertyName("comparison_log_count")] int ComparisonLogCount,
    [property: JsonPropertyName("active_filters")] IReadOnlyList<string> ActiveFilters);

public sealed record PythonGroupingInsight(
    [property: JsonPropertyName("group_id")] int GroupId,
    [property: JsonPropertyName("group_count")] int GroupCount,
    [property: JsonPropertyName("group_size")] int GroupSize,
    [property: JsonPropertyName("average_risk")] double AverageRisk,
    [property: JsonPropertyName("dominant_categories")] IReadOnlyList<string> DominantCategories,
    [property: JsonPropertyName("summary")] string Summary);

public sealed record PythonPriorityAssessment(
    [property: JsonPropertyName("predicted_label")] string PredictedLabel,
    [property: JsonPropertyName("confidence")] double Confidence,
    [property: JsonPropertyName("heuristic_risk_score")] int HeuristicRiskScore,
    [property: JsonPropertyName("assessment_path")] IReadOnlyList<string> AssessmentPath);

public sealed record PythonActivityMovement(
    [property: JsonPropertyName("sample_size")] int SampleSize,
    [property: JsonPropertyName("change_rate")] double ChangeRate,
    [property: JsonPropertyName("baseline_risk")] double BaselineRisk,
    [property: JsonPropertyName("average_risk")] double AverageRisk,
    [property: JsonPropertyName("next_risk_estimate")] double NextRiskEstimate,
    [property: JsonPropertyName("movement")] string Movement,
    [property: JsonPropertyName("fit_score")] double FitScore);

public sealed record PythonAiAnalyzeResponse(
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("explanation")] string Explanation,
    [property: JsonPropertyName("anomalies")] IReadOnlyList<string> Anomalies,
    [property: JsonPropertyName("points_of_interest")] IReadOnlyList<string> PointsOfInterest,
    [property: JsonPropertyName("related_resources")] IReadOnlyList<string> RelatedResources,
    [property: JsonPropertyName("context_overview")] PythonContextOverview ContextOverview,
    [property: JsonPropertyName("feature_vector")] IReadOnlyDictionary<string, double> FeatureVector,
    [property: JsonPropertyName("grouping_insight")] PythonGroupingInsight GroupingInsight,
    [property: JsonPropertyName("priority_assessment")] PythonPriorityAssessment PriorityAssessment,
    [property: JsonPropertyName("activity_movement")] PythonActivityMovement ActivityMovement);

public sealed record LogAnalysisResponse(
    ResourceLogDetail Log,
    PythonAiAnalyzeResponse Analysis);

public sealed record SavedLogDocument(
    [property: JsonPropertyName("_id")] string? Id,
    [property: JsonPropertyName("dataset")] string Dataset,
    [property: JsonPropertyName("logId")] int? LogId,
    [property: JsonPropertyName("prompt")] string? Prompt,
    [property: JsonPropertyName("analyzedAt")] string? AnalyzedAt,
    [property: JsonPropertyName("originalLog")] JsonElement? OriginalLog,
    [property: JsonPropertyName("analysis")] AiAnalyzeResponse? Analysis);

public sealed record LogsBatchRequest(
    [property: JsonPropertyName("dataset")] string Dataset,
    [property: JsonPropertyName("logIds")] IReadOnlyList<int> LogIds,
    [property: JsonPropertyName("prompt")] string? Prompt);

public sealed record AiBatchAnalyzeResponse(
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("anomalies")] IReadOnlyList<string> Anomalies,
    [property: JsonPropertyName("points_of_interest")] IReadOnlyList<string> PointsOfInterest,
    [property: JsonPropertyName("log_count")] int LogCount);

public sealed record SavedAnalysisResult(
    string Id,
    string Dataset,
    int LogId,
    string AnalyzedAt,
    string? Prompt,
    AiAnalyzeResponse Analysis);
