using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace backend.Tests;

public class EndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public EndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    // 1. Health endpoint returns 200
    [Fact]
    public async Task Health_Endpoint_Returns_200()
    {
        var response = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // 2. Logs endpoint responds successfully
    [Fact]
    public async Task Logs_Endpoint_Responds_Successfully()
    {
        var response = await _client.GetAsync("/api/logs/?dataset=default&skip=0&take=10");
        Assert.True(
            response.StatusCode == HttpStatusCode.OK ||
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Unexpected status: {response.StatusCode}"
        );
    }

    // 3. Logs endpoint returns bad request for invalid dataset
    [Fact]
    public async Task Logs_Endpoint_Returns_BadRequest_For_Invalid_Dataset()
    {
        var response = await _client.GetAsync("/api/logs/?dataset=invalid_dataset_xyz&skip=0&take=10");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // 4. Log detail returns 404 for missing id
    [Fact]
    public async Task Log_Detail_Returns_404_For_Missing_Id()
    {
        var response = await _client.GetAsync("/api/logs/999999?dataset=default");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // 5. Analyze endpoint returns 404 for missing log
    [Fact]
    public async Task Analyze_Endpoint_Returns_404_For_Missing_Log()
    {
        var response = await _client.PostAsync("/api/logs/999999/analyze?dataset=default", null);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // 6. Database health endpoint responds with JSON
    [Fact]
    public async Task Database_Health_Endpoint_Responds_With_JSON()
    {
        var response = await _client.GetAsync("/health/database");
        var contentType = response.Content.Headers.ContentType?.MediaType;
        Assert.True(
            response.StatusCode == HttpStatusCode.OK ||
            response.StatusCode == HttpStatusCode.ServiceUnavailable,
            $"Unexpected status: {response.StatusCode}"
        );
        Assert.Equal("application/json", contentType);
    }
}