using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public sealed class AiAnalysisClient
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;

    public AiAnalysisClient(HttpClient httpClient, IOptions<BackendOptions> options)
    {
        _httpClient = httpClient;
        _baseUrl = options.Value.AiService.BaseUrl.TrimEnd('/');
    }

    public async Task<AiServiceHealth> CheckHealthAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _httpClient.GetAsync("health", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new AiServiceHealth(
                    false,
                    "unavailable",
                    _baseUrl,
                    $"Health endpoint returned HTTP {(int)response.StatusCode}.");
            }

            return new AiServiceHealth(true, "ok", _baseUrl, null);
        }
        catch (Exception exception)
        {
            return new AiServiceHealth(false, "unavailable", _baseUrl, exception.Message);
        }
    }

    public async Task<AiAnalyzeResponse> AnalyzeAsync(
        ResourceLogDetail log,
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
                ["changes"] = log.Changes
            });

        using var response = await _httpClient.PostAsJsonAsync(
            "analyze",
            request,
            cancellationToken: cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"AI service returned HTTP {(int)response.StatusCode}: {responseBody}");
        }

        var payload = await response.Content.ReadFromJsonAsync<AiAnalyzeResponse>(cancellationToken: cancellationToken);
        return payload ?? throw new InvalidOperationException("AI service returned an empty response body.");
    }
}
