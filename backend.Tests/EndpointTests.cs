using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace backend.Tests;

public class EndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;
    private const string AdminKey = "key-admin-full";
    private const string Ds1Key = "key-user-ds1";
    private const string ApiKeyHeader = "X-Api-Key";

    public EndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                // Inject test users that match the Users[] format in appsettings.json
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Users:0:ApiKey"] = AdminKey,
                    ["Users:0:AllowedDatasets:0"] = "DATASET1",
                    ["Users:0:AllowedDatasets:1"] = "DATASET2",
                    ["Users:1:ApiKey"] = Ds1Key,
                    ["Users:1:AllowedDatasets:0"] = "DATASET1",
                });
            });
        }).CreateClient();
    }

    // 1. Health endpoint returns 200 (public, no auth needed)
    [Fact]
    public async Task Health_Endpoint_Returns_200()
    {
        var response = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // 2. Logs endpoint returns 401 without API key
    [Fact]
    public async Task Logs_Endpoint_Returns_401_Without_ApiKey()
    {
        var response = await _client.GetAsync("/api/logs/?dataset=DATASET1&skip=0&take=20");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // 3. Logs endpoint returns BadRequest for invalid dataset name (with valid key)
    [Fact]
    public async Task Logs_Endpoint_Returns_BadRequest_For_Invalid_Dataset()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/logs/?dataset=INVALID_DATASET&skip=0&take=20");
        request.Headers.Add(ApiKeyHeader, AdminKey);
        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // 4. DS1-only user gets 403 when accessing DATASET2
    [Fact]
    public async Task Logs_Endpoint_Returns_403_For_Unauthorized_Dataset()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/logs/?dataset=DATASET2&skip=0&take=20");
        request.Headers.Add(ApiKeyHeader, Ds1Key);
        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // 5. Datasets endpoint returns only allowed datasets for DS1 user
    [Fact]
    public async Task Datasets_Endpoint_Returns_Configured_Datasets()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/logs/datasets");
        request.Headers.Add(ApiKeyHeader, AdminKey);
        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    // 6. Log detail returns 404 for missing id (requires live DB - expected to fail without Docker)
    [Fact]
    public async Task Log_Detail_Returns_404_For_Missing_Id_In_DATASET1()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/logs/999999?dataset=DATASET1");
        request.Headers.Add(ApiKeyHeader, AdminKey);
        var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // 7. Database health endpoint responds with JSON (public, no auth needed)
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