using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;
using Project4_AI_Analysis_of_Resource_Logs.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddOpenApi();
builder.Services.Configure<BackendOptions>(builder.Configuration);
builder.Services.AddSingleton<SqlLogRepository>();
builder.Services.AddSingleton<DatabaseHealthService>();
builder.Services.AddSingleton<IMongoClient>(_ =>
{
    var connectionString = builder.Configuration.GetConnectionString("MongoDb")
        ?? throw new InvalidOperationException("Missing MongoDB connection string.");

    return new MongoClient(connectionString);
});
builder.Services.AddHttpClient<AiAnalysisClient>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<BackendOptions>>().Value;

    if (!Uri.TryCreate(options.AiService.BaseUrl, UriKind.Absolute, out var baseUri))
    {
        throw new InvalidOperationException("AiService:BaseUrl must be a valid absolute URL.");
    }

    client.BaseAddress = baseUri;
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.MapGet("/health", (SqlLogRepository repository) => Results.Ok(new
{
    status = "ok",
    service = "backend",
    datasets = repository.GetConfiguredDatasets()
}));

app.MapGet("/health/database", async (DatabaseHealthService healthService, CancellationToken cancellationToken) =>
{
    var result = await healthService.CheckAsync(cancellationToken);

    return result.IsHealthy
        ? Results.Ok(result)
        : Results.Json(result, statusCode: StatusCodes.Status503ServiceUnavailable);
});

app.MapGet("/health/ai", async (AiAnalysisClient aiClient, CancellationToken cancellationToken) =>
{
    var result = await aiClient.CheckHealthAsync(cancellationToken);

    return result.IsHealthy
        ? Results.Ok(result)
        : Results.Json(result, statusCode: StatusCodes.Status503ServiceUnavailable);
});

var logRoutes = app.MapGroup("/api/logs");

logRoutes.MapGet("/datasets", (SqlLogRepository repository) => Results.Ok(new
{
    datasets = repository.GetConfiguredDatasets()
}));

logRoutes.MapGet("/", async (
    string? dataset,
    string? level,
    string? category,
    string? search,
    int skip,
    int take,
    SqlLogRepository repository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var response = await repository.GetLogsAsync(dataset, level, category, search, skip, take, cancellationToken);
        return Results.Ok(response);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
});

logRoutes.MapGet("/{id:int}", async (
    int id,
    string? dataset,
    SqlLogRepository repository,
    CancellationToken cancellationToken) =>
{
    try
    {
        var log = await repository.GetLogByIdAsync(dataset, id, cancellationToken);

        return log is null
            ? Results.NotFound(new { message = $"Log with id {id} was not found." })
            : Results.Ok(log);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
});

logRoutes.MapPost("/{id:int}/analyze", async (
    int id,
    string? dataset,
    SqlLogRepository repository,
    AiAnalysisClient aiClient,
    CancellationToken cancellationToken) =>
{
    try
    {
        var log = await repository.GetLogByIdAsync(dataset, id, cancellationToken);
        if (log is null)
        {
            return Results.NotFound(new { message = $"Log with id {id} was not found." });
        }

        var analysis = await aiClient.AnalyzeAsync(log, cancellationToken);
        var response = new LogAnalysisResponse(log, analysis);

        return Results.Ok(response);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
    catch (HttpRequestException exception)
    {
        return Results.Problem(
            title: "AI service unavailable",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
