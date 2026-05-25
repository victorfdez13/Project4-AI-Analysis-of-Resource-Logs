namespace Project4_AI_Analysis_of_Resource_Logs.Options;

public sealed class BackendOptions
{
    public List<string> SqlServerDatasets { get; set; } = [];

    public MongoSettings MongoSettings { get; set; } = new();

    public AiServiceSettings AiService { get; set; } = new();

    public PythonAiServiceSettings PythonAiService { get; set; } = new();
}

public sealed class MongoSettings
{
    public string DatabaseName { get; set; } = "resource_logs";

    public string CollectionName { get; set; } = "dataset1_logs";
}

public sealed class AiServiceSettings
{
    public string BaseUrl { get; set; } = "http://localhost:8000";
}

public sealed class PythonAiServiceSettings
{
    public string BaseUrl { get; set; } = "http://localhost:8010";
}
