using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public sealed class AiAnalysisClient
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly ILogger<AiAnalysisClient> _logger;

    public AiAnalysisClient(HttpClient httpClient, IOptions<BackendOptions> options, ILogger<AiAnalysisClient> logger)
    {
        _httpClient = httpClient;
        _baseUrl = options.Value.AiService.BaseUrl.TrimEnd('/');
        _logger = logger;
    }

    public async Task<AiServiceHealth> CheckHealthAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _httpClient.GetAsync("health", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("AI service health check failed with status {StatusCode}", (int)response.StatusCode);
                return new AiServiceHealth(
                    false,
                    "unavailable",
                    _baseUrl,
                    $"Health endpoint returned HTTP {(int)response.StatusCode}.");
            }

            _logger.LogInformation("AI service health check successful");
            return new AiServiceHealth(true, "ok", _baseUrl, null);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("AI service health check timed out");
            return new AiServiceHealth(false, "unavailable", _baseUrl, "Request timeout");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "AI service health check failed with HTTP error");
            return new AiServiceHealth(false, "unavailable", _baseUrl, $"HTTP error: {ex.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI service health check failed unexpectedly");
            return new AiServiceHealth(false, "unavailable", _baseUrl, ex.Message);
        }
    }

    public async Task<AiAnalyzeResponse> AnalyzeAsync(
        ResourceLogDetail log,
        string? prompt,
        CancellationToken cancellationToken)
    {
        if (log == null)
        {
            throw new ValidationException("Log cannot be null");
        }

        var request = new AiAnalyzeRequest(
            log.MainEntityId ?? $"log-{log.LogId}",
            log.Message,
            log.Time,
            new Dictionary<string, object?>
            {
                ["dataset"] = log.Dataset,
                ["logId"] = log.LogId,
                ["category"] = log.Category,
                ["level"] = log.Level,
                ["sessionId"] = log.SessionId,
                ["mainEntityId"] = log.MainEntityId,
                ["impersonatorMainEntityId"] = log.ImpersonatorMainEntityId,
                ["entities"] = log.Entities,
                ["changes"] = log.Changes,
                ["prompt"] = prompt
            });

        try
        {
            using var response = await _httpClient.PostAsJsonAsync(
                "analyze",
                request,
                cancellationToken: cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("AI service analysis failed with status {StatusCode}: {ResponseBody}", 
                    (int)response.StatusCode, responseBody);
                
                throw new ServiceUnavailableException(
                    $"AI service returned HTTP {(int)response.StatusCode}: {responseBody}");
            }

            var payload = await response.Content.ReadFromJsonAsync<AiAnalyzeResponse>(cancellationToken: cancellationToken);
            if (payload == null)
            {
                throw new ServiceUnavailableException("AI service returned an empty response body.");
            }

            _logger.LogInformation("AI analysis completed successfully for log {LogId}", log.LogId);
            return payload;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("AI analysis request timed out for log {LogId}", log.LogId);
            throw new ServiceUnavailableException("AI service request timeout");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "AI analysis HTTP error for log {LogId}", log.LogId);
            throw new ServiceUnavailableException($"AI service error: {ex.Message}", ex);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse AI service response for log {LogId}", log.LogId);
            throw new ServiceUnavailableException("Invalid response from AI service", ex);
        }
    }

    public async Task<AiBatchAnalyzeResponse> AnalyzeBatchAsync(
        IReadOnlyList<ResourceLogDetail> logs,
        string? prompt,
        CancellationToken cancellationToken)
    {
        var payload = new
        {
            logs = logs.Select(log => new Dictionary<string, object?>
            {
                ["logId"] = log.LogId,
                ["category"] = log.Category,
                ["message"] = log.Message,
                ["time"] = log.Time.ToString("o"),
                ["level"] = log.Level,
                ["dataset"] = log.Dataset,
                ["mainEntityId"] = log.MainEntityId,
                ["impersonatorMainEntityId"] = log.ImpersonatorMainEntityId,
                ["sessionId"] = log.SessionId,
            }).ToList(),
            prompt,
        };

        try
        {
            using var response = await _httpClient.PostAsJsonAsync(
                "analyze-batch",
                payload,
                cancellationToken: cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new ServiceUnavailableException(
                    $"AI service returned HTTP {(int)response.StatusCode}: {body}");
            }

            var result = await response.Content.ReadFromJsonAsync<AiBatchAnalyzeResponse>(
                cancellationToken: cancellationToken);

            return result ?? throw new ServiceUnavailableException("AI service returned an empty batch response.");
        }
        catch (OperationCanceledException)
        {
            throw new ServiceUnavailableException("AI service batch request timeout");
        }
        catch (HttpRequestException ex)
        {
            throw new ServiceUnavailableException($"AI service error: {ex.Message}", ex);
        }
        catch (JsonException ex)
        {
            throw new ServiceUnavailableException("Invalid response from AI service", ex);
        }
    }

    public async Task<IReadOnlyList<SavedLogDocument>> ListSavedLogsAsync(
        string dataset,
        int limit,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dataset))
        {
            throw new ValidationException("Dataset cannot be null or empty");
        }

        if (limit <= 0 || limit > 1000)
        {
            throw new ValidationException("Limit must be between 1 and 1000");
        }

        try
        {
            var query = $"saved-logs?dataset={Uri.EscapeDataString(dataset)}&limit={limit}";
            using var response = await _httpClient.GetAsync(query, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Failed to list saved logs with status {StatusCode}: {ResponseBody}", 
                    (int)response.StatusCode, responseBody);
                
                throw new ServiceUnavailableException(
                    $"AI service returned HTTP {(int)response.StatusCode}: {responseBody}");
            }

            var payload = await response.Content.ReadFromJsonAsync<List<SavedLogDocument>>(
                cancellationToken: cancellationToken);
            return payload ?? [];
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("List saved logs request timed out for dataset {Dataset}", dataset);
            throw new ServiceUnavailableException("Request timeout");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error listing saved logs for dataset {Dataset}", dataset);
            throw new ServiceUnavailableException($"Service error: {ex.Message}", ex);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse saved logs response for dataset {Dataset}", dataset);
            throw new ServiceUnavailableException("Invalid response from service", ex);
        }
    }

    public async Task<SavedLogDocument?> GetSavedLogAsync(
        string dataset,
        int logId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dataset))
        {
            throw new ValidationException("Dataset cannot be null or empty");
        }

        if (logId <= 0)
        {
            throw new ValidationException("LogId must be greater than 0");
        }

        try
        {
            var query = $"saved-logs/{logId}?dataset={Uri.EscapeDataString(dataset)}";
            using var response = await _httpClient.GetAsync(query, cancellationToken);

            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                _logger.LogInformation("Saved log not found: dataset={Dataset}, logId={LogId}", dataset, logId);
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Failed to get saved log with status {StatusCode}: {ResponseBody}", 
                    (int)response.StatusCode, responseBody);
                
                throw new ServiceUnavailableException(
                    $"AI service returned HTTP {(int)response.StatusCode}: {responseBody}");
            }

            var payload = await response.Content.ReadFromJsonAsync<SavedLogDocument>(
                cancellationToken: cancellationToken);
            
            if (payload != null)
            {
                _logger.LogInformation("Successfully retrieved saved log: dataset={Dataset}, logId={LogId}", dataset, logId);
            }

            return payload;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Get saved log request timed out for dataset={Dataset}, logId={LogId}", dataset, logId);
            throw new ServiceUnavailableException("Request timeout");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error getting saved log for dataset={Dataset}, logId={LogId}", dataset, logId);
            throw new ServiceUnavailableException($"Service error: {ex.Message}", ex);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse saved log response for dataset={Dataset}, logId={LogId}", dataset, logId);
            throw new ServiceUnavailableException("Invalid response from service", ex);
        }
    }
}
