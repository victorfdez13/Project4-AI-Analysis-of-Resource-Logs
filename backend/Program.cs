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
builder.Services.AddSingleton<SqlLogRepository>();
builder.Services.AddSingleton<DatabaseHealthService>();
builder.Services.AddSingleton<MongoPromptRepository>();
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<DatasetStore>();
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
builder.Services.AddHttpClient<PythonAiAnalysisClient>();

// API key authentication
builder.Services.AddAuthentication("ApiKey")
    .AddScheme<AuthenticationSchemeOptions, ApiKeyAuthHandler>("ApiKey", null);
builder.Services.AddAuthorization(options =>
{
    // Three internal roles: admin (everything), support_agent (assigned
    // customers' datasets), customer (own dataset only).
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("admin"));

    options.AddPolicy("SupportOrAdmin", policy =>
        policy.RequireRole("admin", "support_agent"));

    options.AddPolicy("AnyAuth", policy =>
        policy.RequireRole("admin", "support_agent", "customer"));
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

// Add error handling middleware
app.UseErrorHandling();

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

// Self-service signup. New accounts default to the customer role with the
// first configured dataset assigned; an admin can promote them later via
// /api/users.
app.MapPost("/register", (RegisterRequest request, UserStore userStore, SqlLogRepository repository) =>
{
    var firstDataset = repository.GetConfiguredDatasets().FirstOrDefault() ?? "DATASET1";
    var (created, error) = userStore.Create(new UserRecord
    {
        Username = request.Username,
        Password = request.Password,
        Role = UserRoles.Customer,
        AllowedDatasets = new List<string> { firstDataset },
    });

    if (error is not null)
        return Results.BadRequest(new { message = error });

    return Results.Ok(new
    {
        message = "Account created successfully",
        apiKey = created!.ApiKey,
        username = created.Username,
        role = created.Role,
        allowedDatasets = created.AllowedDatasets,
    });
});

// Username + password login. Returns the user's API key so the frontend
// can store it and send it on subsequent requests.
app.MapPost("/login", (LoginRequest request, UserStore userStore) =>
{
    if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        return Results.BadRequest(new { message = "Username and password are required." });

    var user = userStore.Authenticate(request.Username, request.Password);
    if (user is null)
        return Results.Json(new { message = "Invalid username or password." }, statusCode: StatusCodes.Status401Unauthorized);

    return Results.Ok(new
    {
        apiKey = user.ApiKey,
        username = user.Username,
        role = user.Role,
        allowedDatasets = user.AllowedDatasets,
    });
});

// Who am I — returns the authenticated user's profile (no password).
app.MapGet("/me", (HttpContext context, UserStore userStore) =>
{
    var apiKey = context.User.Identity?.Name;
    if (string.IsNullOrWhiteSpace(apiKey))
        return Results.Unauthorized();

    var user = userStore.FindByApiKey(apiKey);
    if (user is null)
        return Results.Unauthorized();

    return Results.Ok(new
    {
        username = user.Username,
        role = user.Role,
        allowedDatasets = user.AllowedDatasets,
    });
}).RequireAuthorization("AnyAuth");

// Admin-only user management. Returns the user list without passwords.
var userRoutes = app.MapGroup("/api/users").RequireAuthorization("AdminOnly");

userRoutes.MapGet("/", (UserStore userStore) =>
{
    var sanitized = userStore.All().Select(u => new
    {
        username = u.Username,
        role = u.Role,
        allowedDatasets = u.AllowedDatasets,
        apiKey = u.ApiKey,
    });
    return Results.Ok(new { users = sanitized });
});

userRoutes.MapPost("/", (CreateUserRequest request, UserStore userStore) =>
{
    var (created, error) = userStore.Create(new UserRecord
    {
        Username = request.Username,
        Password = request.Password,
        Role = (request.Role ?? UserRoles.Customer).ToLowerInvariant(),
        AllowedDatasets = request.AllowedDatasets ?? new List<string>(),
    });

    if (error is not null)
        return Results.BadRequest(new { message = error });

    return Results.Created($"/api/users/{created!.Username}", new
    {
        username = created.Username,
        role = created.Role,
        allowedDatasets = created.AllowedDatasets,
        apiKey = created.ApiKey,
    });
});

userRoutes.MapPut("/{username}", (string username, UpdateUserRequest request, UserStore userStore) =>
{
    var (updated, error) = userStore.Update(username, new UserRecord
    {
        Role = (request.Role ?? string.Empty).ToLowerInvariant(),
        AllowedDatasets = request.AllowedDatasets ?? new List<string>(),
        Password = request.Password ?? string.Empty,
    });

    if (error is not null)
        return Results.BadRequest(new { message = error });

    return Results.Ok(new
    {
        username = updated!.Username,
        role = updated.Role,
        allowedDatasets = updated.AllowedDatasets,
    });
});

userRoutes.MapDelete("/{username}", (string username, UserStore userStore, HttpContext context) =>
{
    // Don't let an admin delete their own account by accident.
    var currentApiKey = context.User.Identity?.Name;
    var current = currentApiKey is null ? null : userStore.FindByApiKey(currentApiKey);
    if (current is not null && string.Equals(current.Username, username, StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "You cannot delete your own account." });

    return userStore.Delete(username)
        ? Results.NoContent()
        : Results.NotFound(new { message = $"User '{username}' not found." });
});

// Admin-only dataset registration. The frontend uses this to add a new
// dataset by name; the underlying SQL Server database is assumed to
// already exist.
var datasetRoutes = app.MapGroup("/api/datasets").RequireAuthorization("AdminOnly");

datasetRoutes.MapGet("/", (DatasetStore datasetStore) =>
    Results.Ok(new { datasets = datasetStore.All() }));

datasetRoutes.MapPost("/", (RegisterDatasetRequest request, DatasetStore datasetStore) =>
{
    var error = datasetStore.Add(request.Name ?? string.Empty);
    if (error is not null) return Results.BadRequest(new { message = error });
    return Results.Created($"/api/datasets/{request.Name}", new { datasets = datasetStore.All() });
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
}).RequireAuthorization("AnyAuth");

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
}).RequireAuthorization("AnyAuth");

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
}).RequireAuthorization("AnyAuth");

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
}).RequireAuthorization("AnyAuth");

// Batch-analyze endpoint — analyzes multiple selected logs and returns an aggregated summary
logRoutes.MapPost("/analyze-batch", async (
    LogsBatchRequest body,
    HttpContext context,
    SqlLogRepository repository,
    AiAnalysisClient aiClient,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, body.Dataset))
        return Results.Forbid();

    if (body.LogIds is null || body.LogIds.Count == 0)
        return Results.BadRequest(new { message = "logIds cannot be empty." });

    if (body.LogIds.Count > 50)
        return Results.BadRequest(new { message = "At most 50 logs can be analyzed at once." });

    try
    {
        var logTasks = body.LogIds.Select(id =>
            repository.GetLogByIdAsync(body.Dataset, id, cancellationToken));

        var fetched = await Task.WhenAll(logTasks);
        var logs = fetched.Where(l => l is not null).Select(l => l!).ToList();

        if (logs.Count == 0)
            return Results.NotFound(new { message = "None of the requested logs were found." });

        var result = await aiClient.AnalyzeBatchAsync(logs, body.Prompt, cancellationToken);
        return Results.Ok(result);
    }
    catch (ServiceUnavailableException ex)
    {
        return Results.Problem(
            title: "AI service unavailable",
            detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
})
.RequireAuthorization("SupportOrAdmin");

// Analyze endpoint — runs AI analysis and saves result to MongoDB
logRoutes.MapPost("/{id:int}/analyze", async (
    int id,
    string? dataset,
    string? prompt,
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

        var analysis = await aiClient.AnalyzeAsync(log, prompt, cancellationToken);

        await mongoRepository.SaveAnalysisAsync(
            log.Dataset,
            log.LogId,
            log,
            analysis,
            prompt,
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
.RequireAuthorization("SupportOrAdmin");

// Test-only endpoint â€” sends the selected log to the redesigned python_ai service
logRoutes.MapPost("/{id:int}/analyze-python-ai", async (
    int id,
    string? dataset,
    string? prompt,
    HttpContext context,
    SqlLogRepository repository,
    PythonAiAnalysisClient pythonAiClient,
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

        var analysis = await pythonAiClient.AnalyzeAsync(log, prompt, cancellationToken);
        var response = new LogAnalysisResponse(log, analysis);
        return Results.Ok(response);
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
.RequireAuthorization("SupportOrAdmin");

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
}).RequireAuthorization("AnyAuth");

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
}).RequireAuthorization("AnyAuth");

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

// API key authentication handler — resolves the user via UserStore and
// attaches role + dataset claims to the principal.
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

        var userStore = Context.RequestServices.GetRequiredService<UserStore>();
        var user = userStore.FindByApiKey(extractedApiKey.ToString());

        if (user is null)
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key."));

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.Name, user.ApiKey),
            new Claim(ClaimTypes.Role, user.Role),
        };

        foreach (var dataset in user.AllowedDatasets)
            claims.Add(new Claim("dataset", dataset));

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

public sealed record LoginRequest(string Username, string Password);

public sealed record RegisterDatasetRequest(string? Name);

public sealed record CreateUserRequest(
    string Username,
    string Password,
    string? Role,
    List<string>? AllowedDatasets);

public sealed record UpdateUserRequest(
    string? Role,
    List<string>? AllowedDatasets,
    string? Password);
