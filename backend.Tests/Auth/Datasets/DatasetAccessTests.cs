using System.Net;
using backend.Tests.Auth.Helpers;

namespace backend.Tests.Auth.Datasets;

public class DatasetAccessTests : IClassFixture<AuthWebFactory>
{
    private readonly HttpClient _client;

    public DatasetAccessTests(AuthWebFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Admin_Datasets_ContainsBothDatasets()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    [Fact]
    public async Task Analyst_Datasets_ContainsOnlyDataset1()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AnalystKey));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("DATASET1", body);
        Assert.DoesNotContain("DATASET2", body);
    }

    [Fact]
    public async Task Viewer_Datasets_ContainsOnlyDataset2()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.ViewerKey));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("DATASET1", body);
        Assert.Contains("DATASET2", body);
    }

    [Fact]
    public async Task DatasetsEndpoint_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync("/api/logs/datasets");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Logs_ForbiddenDataset_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET2&skip=0&take=20", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task LogDetail_ForbiddenDataset_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/1?dataset=DATASET2", TestUsers.AnalystKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Logs_DatasetNotInUserAllowedList_Returns403()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET_UNKNOWN&skip=0&take=20", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task DatasetsEndpoint_ResponseBody_ContainsDatasetsKey()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/datasets", TestUsers.AdminKey));
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("datasets", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Logs_NoDatasetParam_Returns400()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?skip=0&take=20", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task LogDetail_NonExistentId_Returns404()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/999999?dataset=DATASET1", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Admin_CanRetrieveLogs_FromDataset1_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET1&skip=0&take=20", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Trait("Category", "Integration")]
    [Fact]
    public async Task Admin_CanRetrieveLogs_FromDataset2_Returns200()
    {
        var response = await _client.SendAsync(
            TestUsers.Get("/api/logs/?dataset=DATASET2&skip=0&take=20", TestUsers.AdminKey));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
