using System.Net.Http.Json;
using System.Text.Json;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public sealed class PythonAiAnalysisClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<PythonAiAnalysisClient> _logger;

    public PythonAiAnalysisClient(
        HttpClient httpClient,
        ILogger<PythonAiAnalysisClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<PythonAiAnalyzeResponse> AnalyzeAsync(
        ResourceLogDetail log,
        string? prompt,
        CancellationToken cancellationToken)
    {
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
                _logger.LogError(
                    "Python AI analysis failed with status {StatusCode}: {ResponseBody}",
                    (int)response.StatusCode,
                    responseBody);

                throw new ServiceUnavailableException(
                    $"Python AI service returned HTTP {(int)response.StatusCode}: {responseBody}");
            }

            var payload = await response.Content.ReadFromJsonAsync<PythonAiAnalyzeResponse>(
                cancellationToken: cancellationToken);

            if (payload == null)
            {
                throw new ServiceUnavailableException("Python AI service returned an empty response body.");
            }

            _logger.LogInformation("Python AI analysis completed successfully for log {LogId}", log.LogId);
            return payload;
        }
        catch (OperationCanceledException)
        {
            throw new ServiceUnavailableException("Python AI service request timeout");
        }
        catch (HttpRequestException ex)
        {
            throw new ServiceUnavailableException($"Python AI service error: {ex.Message}", ex);
        }
        catch (JsonException ex)
        {
            throw new ServiceUnavailableException("Invalid response from Python AI service", ex);
        }
    }
}
