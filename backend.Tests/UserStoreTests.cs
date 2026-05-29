using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Project4_AI_Analysis_of_Resource_Logs.Services;

namespace backend.Tests;

public sealed class UserStoreTests
{
    [Fact]
    public void Update_DoesNotMutateUser_WhenValidationFails()
    {
        var contentRoot = Path.Combine(Path.GetTempPath(), $"user-store-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(contentRoot);

        try
        {
            var usersPath = Path.Combine(contentRoot, "users.json");
            File.WriteAllText(usersPath, """
[
  {
    "username": "support",
    "password": "1234",
    "apiKey": "key-support-ds1",
    "role": "support_agent",
    "allowedDatasets": ["DATASET1", "DATASET2"]
  }
]
""");

            var configuration = new ConfigurationBuilder().Build();
            var environment = new TestWebHostEnvironment(contentRoot);
            var store = new UserStore(configuration, environment);

            var (updatedUser, error) = store.Update("support", new UserRecord
            {
                Role = UserRoles.Customer,
                AllowedDatasets = ["DATASET1", "DATASET2", "DATASET3"]
            });

            Assert.Null(updatedUser);
            Assert.Equal("A customer must have exactly one assigned dataset.", error);

            var persistedUser = store.FindByUsername("support");
            Assert.NotNull(persistedUser);
            Assert.Equal(UserRoles.SupportAgent, persistedUser!.Role);
            Assert.Equal(["DATASET1", "DATASET2"], persistedUser.AllowedDatasets);

            var json = File.ReadAllText(usersPath);
            Assert.Contains("\"role\": \"support_agent\"", json);
            Assert.DoesNotContain("DATASET3", json, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(contentRoot, recursive: true);
        }
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public TestWebHostEnvironment(string contentRootPath)
        {
            ApplicationName = "backend.Tests";
            ContentRootPath = contentRootPath;
            ContentRootFileProvider = new PhysicalFileProvider(contentRootPath);
            EnvironmentName = Environments.Development;
            WebRootPath = contentRootPath;
            WebRootFileProvider = ContentRootFileProvider;
        }

        public string ApplicationName { get; set; }
        public IFileProvider WebRootFileProvider { get; set; }
        public string WebRootPath { get; set; }
        public string EnvironmentName { get; set; }
        public string ContentRootPath { get; set; }
        public IFileProvider ContentRootFileProvider { get; set; }
    }
}
