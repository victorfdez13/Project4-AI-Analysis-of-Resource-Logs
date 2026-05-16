using System.Net;
using backend.Tests.Auth.Helpers;

namespace backend.Tests.Auth;

public class LoginFlowTests : IClassFixture<AuthWebFactory>
{
    private readonly HttpClient _client;

    public LoginFlowTests(AuthWebFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task NoApiKey_Returns401()
    {
        var response = await _client.GetAsync("/api/logs/datasets");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task InvalidApiKey_Returns401()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", "completely-invalid-key"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AdminApiKey_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task AnalystApiKey_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ViewerApiKey_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.ViewerKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task AdminLogin_IdentityContains_BothDatasets()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    [Fact]
    public async Task AnalystLogin_IdentityContains_OnlyDataset1()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AnalystKey));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("DATASET1", body);
        Assert.DoesNotContain("DATASET2", body);
    }

    [Fact]
    public async Task ViewerLogin_IdentityContains_OnlyDataset2()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.ViewerKey));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    [Fact]
    public async Task DatasetsResponse_ContainsDatasetsKey()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("datasets", body, StringComparison.OrdinalIgnoreCase);
    }
}
