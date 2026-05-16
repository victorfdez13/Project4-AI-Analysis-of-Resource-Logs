using System.Net;
using backend.Tests.Auth.Helpers;

namespace backend.Tests.Auth;

public class RolePermissionTests : IClassFixture<AuthWebFactory>
{
    private readonly HttpClient _client;

    public RolePermissionTests(AuthWebFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Admin_HasViewerAccess_OnDatasetsEndpoint()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Analyst_HasViewerAccess_OnDatasetsEndpoint()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Viewer_HasViewerAccess_OnDatasetsEndpoint()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Viewer_LacksAnalystOrAdminPolicy_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Post("/api/logs/1/analyze?dataset=DATASET2", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_CanSee_AllDatasets()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    [Fact]
    public async Task Analyst_CanSee_OnlyDataset1()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AnalystKey));
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("DATASET1", body);
        Assert.DoesNotContain("DATASET2", body);
    }

    [Fact]
    public async Task Viewer_CanSee_OnlyDataset2()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.ViewerKey));
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Viewer_CanReadLogs_OnAllowedDataset_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET2&skip=0&take=20", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Admin_CanCallAnalyze_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Post("/api/logs/1/analyze?dataset=DATASET1", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Analyst_CanCallAnalyze_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Post("/api/logs/1/analyze?dataset=DATASET1", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
