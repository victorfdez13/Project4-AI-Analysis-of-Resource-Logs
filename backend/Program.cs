using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;
using Project4_AI_Analysis_of_Resource_Logs.Services;
using System.Security.Claims;
using System.Text.Encodings.Web;

var builder = WebApplication.CreateBuilder(args);

var users = builder.Configuration
    .GetSection("Users")
    .Get<List<UserConfig>>() ?? new();

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
    {
        throw new InvalidOperationException("AiService:BaseUrl must be a valid absolute URL.");
    }

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
        policy.RequireRole("admin", "analyst"));

    options.AddPolicy("ViewerAccess", policy =>
        policy.RequireRole("admin", "analyst", "viewer"));
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

// REGISTER
app.MapPost("/register", (RegisterRequest request) =>
{
    // Verificar si ya existe
    if (users.Any(u => u.Username == request.Username))
    {
        return Results.BadRequest(new
        {
            message = "Username already exists"
        });
    }

    // Crear usuario
    var user = new UserConfig
    {
        Username = request.Username,
        Password = request.Password,
        ApiKey = Guid.NewGuid().ToString(),
        Role = "viewer",
        AllowedDatasets = new List<string>
        {
            "DATASET1"
        }
    };

    users.Add(user);

    return Results.Ok(new
    {
        message = "Account created successfully",
        apiKey = user.ApiKey
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

// Analyze endpoint — runs AI analysis and saves result to MongoDB
logRoutes.MapPost("/{id:int}/analyze", async (
    int id,
    string? dataset,
    HttpContext context,
    SqlLogRepository repository,
    AiAnalysisClient aiClient,
    MongoPromptRepository mongoRepository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, dataset))
        return Results.Forbid();

    try
    {
        var log = await repository.GetLogByIdAsync(dataset, id, cancellationToken);
        if (log is null)
        {
            return Results.NotFound(new { message = $"Log with id {id} was not found." });
        }

        var analysis = await aiClient.AnalyzeAsync(log, cancellationToken);

        // Save prompt result to MongoDB
        await mongoRepository.SaveAnalysisAsync(
            log.Dataset,
            log.LogId,
            log,
            analysis,
            cancellationToken);

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
})
.RequireAuthorization("AnalystOrAdmin");
app.MapPost("/register", (RegisterRequest request) =>
{
    // Check if username already exists
    if (users.Any(u => u.Username == request.Username))
    {
        return Results.BadRequest(new
        {
            message = "Username already exists"
        });
    }

    // Create new user
    var user = new UserConfig
    {
        Username = request.Username,
        Password = request.Password,

        ApiKey = Guid.NewGuid().ToString(),

        Role = "viewer",

        AllowedDatasets = new List<string>
        {
            "DATASET1"
        }
    };

    users.Add(user);

    return Results.Ok(new
    {
        message = "Account created successfully",
        apiKey = user.ApiKey
    });
});

// Retrieve saved analysis for a specific log from MongoDB
logRoutes.MapGet("/{id:int}/analysis", async (
    int id,
    string? dataset,
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
        var result = await mongoRepository.GetAnalysisAsync(resolvedDataset, id, cancellationToken);

        return result is null
            ? Results.NotFound(new { message = $"No saved analysis found for log {id}." })
            : Results.Ok(result);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
}).RequireAuthorization("ViewerAccess");

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

// API key authentication handler — reads user config and attaches dataset claims
public class ApiKeyAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private const string ApiKeyHeader = "X-Api-Key";

    public ApiKeyAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiKeyHeader, out var extractedApiKey))
            return Task.FromResult(AuthenticateResult.Fail("Missing API key header."));

        var config = Context.RequestServices.GetRequiredService<IConfiguration>();
        var users = config.GetSection("Users").Get<List<UserConfig>>();

        if (users is null)
            return Task.FromResult(AuthenticateResult.Fail("No users configured."));

        var user = users.FirstOrDefault(u => u.ApiKey == extractedApiKey.ToString());

        if (user is null)
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key."));

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.Name, user.ApiKey),
            // Claim of rol
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

public class UserConfig
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Role { get; set; } = "viewer";
    public List<string> AllowedDatasets { get; set; } = new();
}