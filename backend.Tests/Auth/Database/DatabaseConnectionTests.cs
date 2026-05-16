using System.Net;
using backend.Tests.Auth.Helpers;

namespace backend.Tests.Auth.Database;

public class DatabaseConnectionTests : IClassFixture<AuthWebFactory>
{
    private readonly HttpClient _client;

    public DatabaseConnectionTests(AuthWebFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_Endpoint_IsPublic_NoAuthRequired()
    {
        var response = await _client.GetAsync("/health/database");
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_WhenDockerIsUp_Returns200()
    {
        var response = await _client.GetAsync("/health/database");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_Response_IsJson()
    {
        var response = await _client.GetAsync("/health/database");
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_Response_ContainsIsHealthyField()
    {
        var response = await _client.GetAsync("/health/database");
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("isHealthy", json);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_Response_ContainsSqlServerSection()
    {
        var response = await _client.GetAsync("/health/database");
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("sqlServer", json, StringComparison.OrdinalIgnoreCase);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_Response_ContainsMongoDbSection()
    {
        var response = await _client.GetAsync("/health/database");
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("mongoDb", json, StringComparison.OrdinalIgnoreCase);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task DatabaseHealth_IsConsistent_AcrossThreeCalls()
    {
        var r1 = await _client.GetAsync("/health/database");
        var r2 = await _client.GetAsync("/health/database");
        var r3 = await _client.GetAsync("/health/database");

        Assert.Equal(r1.StatusCode, r2.StatusCode);
        Assert.Equal(r2.StatusCode, r3.StatusCode);
    }
}
