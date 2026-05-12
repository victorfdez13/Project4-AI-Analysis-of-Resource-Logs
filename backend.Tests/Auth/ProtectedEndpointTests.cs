using System.Net;
using backend.Tests.Auth.Helpers;

namespace backend.Tests.Auth;

// Unit tests: 401/403 resolved before any DB call.
// Integration tests: auth passes and the repository is reached.

public class ProtectedEndpointTests : IClassFixture<AuthWebFactory>
{
    private readonly HttpClient _client;

    public ProtectedEndpointTests(AuthWebFactory factory)
    {
        _client = factory.CreateClient();
    }

    // ── Unit: /health reads config only, never touches DB ────────────────────

    [Fact]
    public async Task HealthEndpoint_IsPublic_NoAuthNeeded()
    {
        var response = await _client.GetAsync("/health");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ── Unit: unauthenticated requests rejected before DB ────────────────────

    [Theory]
    [InlineData("/api/logs/datasets")]
    [InlineData("/api/logs/?dataset=DATASET1&skip=0&take=20")]
    [InlineData("/api/logs/1?dataset=DATASET1")]
    public async Task ProtectedGetEndpoints_Return401_WithoutApiKey(string endpoint)
    {
        var response = await _client.GetAsync(endpoint);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AnalyzeEndpoint_Returns401_WithoutApiKey()
    {
        var response = await _client.PostAsync("/api/logs/1/analyze?dataset=DATASET1", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── Unit: cross-dataset access rejected before DB ─────────────────────────

    [Fact]
    public async Task Analyst_CannotRead_Dataset2_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET2&skip=0&take=20", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Viewer_CannotRead_Dataset1_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET1&skip=0&take=20", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Analyst_CannotReadDetail_FromDataset2_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/1?dataset=DATASET2", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Viewer_CannotAnalyze_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Post("/api/logs/1/analyze?dataset=DATASET2", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ── Integration: reach SQL Server — run with Docker ───────────────────────

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealthEndpoint_IsPublic_NoAuthNeeded()
    {
        var response = await _client.GetAsync("/health/database");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Analyst_CanReadLogs_OnDataset1_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET1&skip=0&take=20", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Viewer_CanReadLogs_OnDataset2_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET2&skip=0&take=20", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Theory]
    [InlineData("DATASET1")]
    [InlineData("DATASET2")]
    public async Task Admin_CanReadLogs_OnAnyDataset_Returns200(string dataset)
    {
        var response = await _client.SendAsync(
            TestUsers.Get($"/api/logs/?dataset={dataset}&skip=0&take=20", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
