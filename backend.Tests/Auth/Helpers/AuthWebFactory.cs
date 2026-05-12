using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace backend.Tests.Auth.Helpers;

public sealed class AuthWebFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Users:0:ApiKey"]            = TestUsers.AdminKey,
                ["Users:0:Role"]              = "admin",
                ["Users:0:AllowedDatasets:0"] = "DATASET1",
                ["Users:0:AllowedDatasets:1"] = "DATASET2",

                ["Users:1:ApiKey"]            = TestUsers.AnalystKey,
                ["Users:1:Role"]              = "analyst",
                ["Users:1:AllowedDatasets:0"] = "DATASET1",

                ["Users:2:ApiKey"]            = TestUsers.ViewerKey,
                ["Users:2:Role"]              = "viewer",
                ["Users:2:AllowedDatasets:0"] = "DATASET2",
            });
        });
    }
}

public static class TestUsers
{
    public const string AdminKey     = "test-key-admin";
    public const string AnalystKey   = "test-key-analyst";
    public const string ViewerKey    = "test-key-viewer";
    public const string ApiKeyHeader = "X-Api-Key";

    public static HttpRequestMessage Get(string url, string apiKey)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add(ApiKeyHeader, apiKey);
        return req;
    }

    public static HttpRequestMessage Post(string url, string apiKey)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Add(ApiKeyHeader, apiKey);
        return req;
    }
}
