using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;
using Project4_AI_Analysis_of_Resource_Logs.Services;
using System.Security.Claims;
using System.Text.Encodings.Web;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

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
builder.Services.AddSingleton<DatasetStore>();
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<SqlLogRepository>();
builder.Services.AddSingleton<DatabaseHealthService>();
builder.Services.AddSingleton<MongoPromptRepository>();
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
        throw new InvalidOperationException("AiService:BaseUrl must be a valid absolute URL.");

    client.BaseAddress = baseUri;
});

builder.Services.AddHttpClient<PythonAiAnalysisClient>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<BackendOptions>>().Value;

    if (!Uri.TryCreate(options.PythonAiService.BaseUrl, UriKind.Absolute, out var baseUri))
        throw new InvalidOperationException("PythonAiService:BaseUrl must be a valid absolute URL.");

    client.BaseAddress = baseUri;
});

// API key authentication
builder.Services.AddAuthentication("ApiKey")
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthHandler>("ApiKey", null);
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("admin"));

    options.AddPolicy("AnalystOrAdmin", policy =>
        policy.RequireRole(UserRoles.Admin, UserRoles.SupportAgent));

    options.AddPolicy("ViewerAccess", policy =>
        policy.RequireRole(UserRoles.Admin, UserRoles.SupportAgent, UserRoles.Customer));
});
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy
                .AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod();
        });
});

var app = builder.Build();

app.UseCors("AllowFrontend");

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Health endpoints are public
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

app.MapPost("/login", (LoginRequest request, UserStore userStore) =>
{
    var username = request.Username?.Trim() ?? string.Empty;
    var password = request.Password ?? string.Empty;

    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
    {
        return Results.BadRequest(new { message = "Username and password are required." });
    }

    var user = userStore.Authenticate(username, password);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(new
    {
        username = user.Username,
        apiKey = user.ApiKey,
        role = user.Role,
        allowedDatasets = user.AllowedDatasets,
    });
});

app.MapGet("/me", (HttpContext context) =>
{
    var username = context.User.Identity?.Name;
    var role = context.User.FindFirst(ClaimTypes.Role)?.Value;
    var allowedDatasets = context.User.FindAll("dataset").Select(c => c.Value).ToList();

    return Results.Ok(new
    {
        username,
        role,
        allowedDatasets,
    });
}).RequireAuthorization();

// REGISTER
app.MapPost("/register", (RegisterRequest request, UserStore userStore) =>
{
    var username = request.Username?.Trim() ?? string.Empty;
    var password = request.Password ?? string.Empty;

    var (user, error) = userStore.Create(new UserRecord
    {
        Username = username,
        Password = password,
        Role = UserRoles.Customer,
        AllowedDatasets = new List<string>
        {
            "DATASET1"
        }
    });

    if (error is not null || user is null)
    {
        return Results.BadRequest(new { message = error ?? "Unable to create account." });
    }

    return Results.Ok(new
    {
        message = "Account created successfully",
        username = user.Username,
        apiKey = user.ApiKey,
        role = user.Role,
        allowedDatasets = user.AllowedDatasets,
    });
});

// All /api/logs routes require authentication
var logRoutes = app.MapGroup("/api/logs").RequireAuthorization();

logRoutes.MapGet("/datasets", (HttpContext context, SqlLogRepository repository) =>
{
    // Only return datasets the user is allowed to access
    var allowedDatasets = context.User.FindAll("dataset").Select(c => c.Value).ToList();
    var allDatasets = repository.GetConfiguredDatasets();
    var visibleDatasets = allDatasets.Where(d => allowedDatasets.Contains(d)).ToList();

    return Results.Ok(new { datasets = visibleDatasets });
}).RequireAuthorization("ViewerAccess");

logRoutes.MapGet("/", async (
    string? dataset,
    string? level,
    string? category,
    string? search,
    int skip,
    int take,
    HttpContext context,
    SqlLogRepository repository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, dataset))
        return Results.Forbid();

    try
    {
        var response = await repository.GetLogsAsync(dataset, level, category, search, skip, take, cancellationToken);
        return Results.Ok(response);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
}).RequireAuthorization("ViewerAccess");

logRoutes.MapGet("/{id:int}", async (
    int id,
    string? dataset,
    HttpContext context,
    SqlLogRepository repository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, dataset))
        return Results.Forbid();

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
}).RequireAuthorization("ViewerAccess");

logRoutes.MapGet("/summary", async (
    string? dataset,
    HttpContext context,
    SqlLogRepository repository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, dataset))
        return Results.Forbid();

    try
    {
        var summary = await repository.GetDatasetSummaryAsync(dataset, cancellationToken);
        return Results.Ok(summary);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
}).RequireAuthorization("ViewerAccess");

// Analyze endpoint — calls both ai-service (LLM text) and python-ai (ML) in parallel
logRoutes.MapPost("/{id:int}/analyze", async (
    int id,
    string? dataset,
    string? prompt,
    HttpContext context,
    SqlLogRepository repository,
    PythonAiAnalysisClient pythonAiClient,
    MongoPromptRepository mongoRepository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, dataset))
        return Results.Forbid();

    try
    {
        var log = await repository.GetLogByIdAsync(dataset, id, cancellationToken);

        if (log is null)
            return Results.NotFound(new { message = $"Log with id {id} was not found." });

        var analysis = await pythonAiClient.AnalyzeAsync(log, prompt, cancellationToken);
        var savedAnalysis = new AiAnalyzeResponse(
            analysis.Summary,
            analysis.Explanation,
            analysis.Anomalies,
            analysis.PointsOfInterest,
            analysis.RelatedResources);
        var userId = context.User.Identity?.Name ?? "unknown";
        var userRole = context.User.FindFirst(ClaimTypes.Role)?.Value ?? UserRoles.Customer;
        var sharedWithSupport = string.Equals(userRole, UserRoles.Customer, StringComparison.OrdinalIgnoreCase);

        await mongoRepository.SaveAnalysisAsync(
            log.Dataset,
            log.LogId,
            log,
            savedAnalysis,
            userId,
            userRole,
            sharedWithSupport,
            prompt,
            cancellationToken);

        return Results.Ok(new LogAnalysisResponse(log, analysis));
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
    catch (ServiceUnavailableException exception)
    {
        return Results.Problem(
            title: "Python AI service unavailable",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
})
.RequireAuthorization("AnalystOrAdmin");

// List all saved analyses for a dataset from MongoDB
logRoutes.MapGet("/analyses", async (
    string? dataset,
    int limit,
    HttpContext context,
    SqlLogRepository repository,
    MongoPromptRepository mongoRepository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, dataset))
        return Results.Forbid();

    try
    {
        var resolvedDataset = dataset ?? repository.GetConfiguredDatasets().FirstOrDefault() ?? "";
        var normalizedLimit = Math.Clamp(limit == 0 ? 50 : limit, 1, 200);
        var results = await mongoRepository.ListAnalysesAsync(resolvedDataset, normalizedLimit, cancellationToken);

        return Results.Ok(new { dataset = resolvedDataset, analyses = results });
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
}).RequireAuthorization("ViewerAccess");
// User prompt history
logRoutes.MapGet("/history", async (
    HttpContext context,
    MongoPromptRepository mongoRepository,
    CancellationToken cancellationToken) =>
{
    var userId = context.User.Identity?.Name ?? "unknown";

    var results = await mongoRepository.GetUserHistoryAsync(
        userId,
        cancellationToken);

    return Results.Ok(results);
}).RequireAuthorization("ViewerAccess");
// Support/Admin can retrieve another user's history
logRoutes.MapGet("/support/history/{userId}", async (
    string userId,
    MongoPromptRepository mongoRepository,
    CancellationToken cancellationToken) =>
{
    var results = await mongoRepository.GetUserHistoryAsync(
        userId,
        cancellationToken);

    return Results.Ok(results);

}).RequireAuthorization("AnalystOrAdmin");



var savedLogRoutes = app.MapGroup("/api/saved-logs");

savedLogRoutes.MapGet("/", async (
    string? dataset,
    int? limit,
    SqlLogRepository repository,
    AiAnalysisClient aiClient,
    CancellationToken cancellationToken) =>
{
    var resolvedDataset = string.IsNullOrWhiteSpace(dataset)
        ? repository.GetConfiguredDatasets().FirstOrDefault()
        : dataset;

    if (string.IsNullOrWhiteSpace(resolvedDataset))
    {
        return Results.BadRequest(new { message = "No dataset configured." });
    }

    var resolvedLimit = Math.Clamp(limit ?? 50, 1, 500);

    try
    {
        var items = await aiClient.ListSavedLogsAsync(resolvedDataset, resolvedLimit, cancellationToken);
        return Results.Ok(items);
    }
    catch (HttpRequestException exception)
    {
        return Results.Problem(
            title: "AI service unavailable",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

savedLogRoutes.MapGet("/{id:int}", async (
    int id,
    string? dataset,
    SqlLogRepository repository,
    AiAnalysisClient aiClient,
    CancellationToken cancellationToken) =>
{
    var resolvedDataset = string.IsNullOrWhiteSpace(dataset)
        ? repository.GetConfiguredDatasets().FirstOrDefault()
        : dataset;

    if (string.IsNullOrWhiteSpace(resolvedDataset))
    {
        return Results.BadRequest(new { message = "No dataset configured." });
    }

    try
    {
        var saved = await aiClient.GetSavedLogAsync(resolvedDataset, id, cancellationToken);
        return saved is null
            ? Results.NotFound(new { message = $"No saved analysis for log {id} in dataset {resolvedDataset}." })
            : Results.Ok(saved);
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

// Helper: check if the requested dataset is in the user's allowed list
static bool IsDatasetAllowed(HttpContext context, string? dataset)
{
    if (string.IsNullOrWhiteSpace(dataset)) return true;
    var allowed = context.User.FindAll("dataset").Select(c => c.Value);
    return allowed.Contains(dataset, StringComparer.OrdinalIgnoreCase);
}

public partial class Program { }

public sealed record LoginRequest(string Username, string Password);

// API key authentication handler — reads user config and attaches dataset claims
public class ApiKeyAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private const string ApiKeyHeader = "X-Api-Key";
    private readonly UserStore _userStore;

    public ApiKeyAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        UserStore userStore) : base(options, logger, encoder)
    {
        _userStore = userStore;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiKeyHeader, out var extractedApiKey))
            return Task.FromResult(AuthenticateResult.Fail("Missing API key header."));

        var user = _userStore.FindByApiKey(extractedApiKey.ToString());

        if (user is null)
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key."));

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role)
        };

        // Add one claim per allowed dataset
        foreach (var dataset in user.AllowedDatasets)
            claims.Add(new Claim("dataset", dataset));

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
