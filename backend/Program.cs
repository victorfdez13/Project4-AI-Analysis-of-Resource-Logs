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

var datasetRoutes = app.MapGroup("/api/datasets").RequireAuthorization("AdminOnly");

datasetRoutes.MapGet("/", (DatasetStore datasetStore) =>
{
    return Results.Ok(new
    {
        datasets = datasetStore.All()
    });
});

datasetRoutes.MapPost("/", async (
    DatasetRegistrationRequest request,
    DatasetStore datasetStore,
    SqlLogRepository repository,
    CancellationToken cancellationToken) =>
{
    var requestedName = request.Name ?? string.Empty;
    var validationError = DatasetStore.ValidateName(requestedName);
    if (validationError is not null)
    {
        return Results.BadRequest(new { message = validationError });
    }

    var normalizedName = requestedName.Trim();
    var exists = await repository.DatasetExistsAsync(normalizedName, cancellationToken);
    if (!exists)
    {
        return Results.BadRequest(new
        {
            message = $"Dataset '{normalizedName}' does not exist in SQL Server or is missing dbo.Log."
        });
    }

    var error = datasetStore.Add(normalizedName);
    if (error is not null)
    {
        return Results.BadRequest(new { message = error });
    }

    return Results.Ok(new
    {
        datasets = datasetStore.All()
    });
});

var userRoutes = app.MapGroup("/api/users").RequireAuthorization("AdminOnly");

userRoutes.MapGet("/", (UserStore userStore) =>
{
    var users = userStore
        .All()
        .Select(user => new
        {
            username = user.Username,
            role = user.Role,
            allowedDatasets = user.AllowedDatasets
        });

    return Results.Ok(new { users });
});

userRoutes.MapPost("/", (UserRecord request, UserStore userStore) =>
{
    var (user, error) = userStore.Create(new UserRecord
    {
        Username = request.Username?.Trim() ?? string.Empty,
        Password = request.Password ?? string.Empty,
        Role = request.Role,
        AllowedDatasets = request.AllowedDatasets ?? new List<string>()
    });

    if (error is not null || user is null)
    {
        return Results.BadRequest(new { message = error ?? "Unable to create user." });
    }

    return Results.Ok(new
    {
        username = user.Username,
        role = user.Role,
        allowedDatasets = user.AllowedDatasets
    });
});

userRoutes.MapPut("/{username}", (string username, UserRecord request, UserStore userStore) =>
{
    var (user, error) = userStore.Update(username, request);
    if (error is not null || user is null)
    {
        return Results.BadRequest(new { message = error ?? "Unable to update user." });
    }

    return Results.Ok(new
    {
        username = user.Username,
        role = user.Role,
        allowedDatasets = user.AllowedDatasets
    });
});

userRoutes.MapDelete("/{username}", (string username, HttpContext context, UserStore userStore) =>
{
    var currentUsername = context.User.Identity?.Name;
    if (string.Equals(currentUsername, username, StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { message = "You cannot delete your own account." });
    }

    var removed = userStore.Delete(username);
    return removed
        ? Results.NoContent()
        : Results.NotFound(new { message = $"User '{username}' was not found." });
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
    string? entityId,
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
        var response = await repository.GetLogsAsync(dataset, level, category, search, entityId, skip, take, cancellationToken);
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

logRoutes.MapPost("/chat", async (
    AiChatRequest request,
    AiAnalysisClient aiClient,
    CancellationToken cancellationToken) =>
{
    try
    {
        var response = await aiClient.ChatAsync(
            request.Prompt,
            NormalizeOptionalText(request.SessionId),
            cancellationToken);

        return Results.Ok(response);
    }
    catch (ArgumentException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
    catch (ServiceUnavailableException exception)
    {
        return Results.Problem(
            title: "Chat service unavailable",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}).RequireAuthorization("ViewerAccess");

// Analyze endpoint - uses Python AI for structured analysis and ai-service for text generation.
logRoutes.MapPost("/{id:int}/analyze", async (
    int id,
    string? dataset,
    string? prompt,
    LogAnalyzeRequest? request,
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

        var effectivePrompt = NormalizeOptionalText(request?.Prompt) ?? NormalizeOptionalText(prompt);
        var selectedLogs = await LoadSelectedLogsAsync(
            repository,
            log.Dataset,
            request?.SelectedLogIds,
            id,
            cancellationToken);
        var activeFilters = BuildActiveFilters(
            log.Dataset,
            request?.Level,
            request?.Category,
            request?.Search,
            request?.EntityId,
            request?.SelectedLogIds);

        var analysis = await pythonAiClient.AnalyzeAsync(
            log,
            effectivePrompt,
            selectedLogs,
            activeFilters,
            cancellationToken);
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
            effectivePrompt,
            selectedLogs,
            activeFilters,
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
.RequireAuthorization("ViewerAccess");

logRoutes.MapPost("/analyze-batch", async (
    LogsBatchRequest request,
    HttpContext context,
    SqlLogRepository repository,
    PythonAiAnalysisClient pythonAiClient,
    MongoPromptRepository mongoRepository,
    CancellationToken cancellationToken) =>
{
    if (!IsDatasetAllowed(context, request.Dataset))
        return Results.Forbid();

    if (request.LogIds is not { Count: > 0 })
        return Results.BadRequest(new { message = "Select at least one log to analyze." });

    try
    {
        var selectedLogs = await LoadSelectedLogsAsync(
            repository,
            request.Dataset,
            request.LogIds,
            excludedLogId: null,
            cancellationToken);

        if (selectedLogs.Count == 0)
            return Results.BadRequest(new { message = "None of the selected logs could be loaded." });

        var anchorLog = ChooseAnchorLog(selectedLogs);
        var contextLogs = selectedLogs
            .Where(log => log.LogId != anchorLog.LogId)
            .ToList();
        var effectivePrompt = NormalizeOptionalText(request.Prompt);
        var activeFilters = BuildActiveFilters(
            anchorLog.Dataset,
            request.Level,
            request.Category,
            request.Search,
            request.EntityId,
            request.LogIds);

        var analysis = await pythonAiClient.AnalyzeAsync(
            anchorLog,
            effectivePrompt,
            contextLogs,
            activeFilters,
            cancellationToken);
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
            anchorLog.Dataset,
            anchorLog.LogId,
            anchorLog,
            savedAnalysis,
            userId,
            userRole,
            sharedWithSupport,
            effectivePrompt,
            selectedLogs,
            activeFilters,
            cancellationToken);

        return Results.Ok(new AiBatchAnalyzeResponse(
            analysis.Summary,
            analysis.Explanation,
            analysis.Anomalies,
            analysis.PointsOfInterest,
            analysis.RelatedResources,
            selectedLogs.Count));
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

static async Task<IReadOnlyList<ResourceLogDetail>> LoadSelectedLogsAsync(
    SqlLogRepository repository,
    string dataset,
    IReadOnlyList<int>? logIds,
    int? excludedLogId,
    CancellationToken cancellationToken)
{
    if (logIds is not { Count: > 0 })
    {
        return [];
    }

    var logs = new List<ResourceLogDetail>();
    foreach (var logId in logIds.Distinct())
    {
        if (excludedLogId.HasValue && logId == excludedLogId.Value)
        {
            continue;
        }

        var log = await repository.GetLogByIdAsync(dataset, logId, cancellationToken);
        if (log is not null)
        {
            logs.Add(log);
        }
    }

    return logs;
}

static IReadOnlyDictionary<string, object?> BuildActiveFilters(
    string dataset,
    string? level,
    string? category,
    string? search,
    string? entityId,
    IReadOnlyList<int>? selectedLogIds)
{
    var filters = new Dictionary<string, object?>
    {
        ["dataset"] = dataset
    };

    var normalizedLevel = NormalizeOptionalText(level);
    var normalizedCategory = NormalizeOptionalText(category);
    var normalizedSearch = NormalizeOptionalText(search);
    var normalizedEntityId = NormalizeOptionalText(entityId);

    if (normalizedLevel is not null)
    {
        filters["level"] = normalizedLevel;
    }

    if (normalizedCategory is not null)
    {
        filters["category"] = normalizedCategory;
    }

    if (normalizedSearch is not null)
    {
        filters["search"] = normalizedSearch;
    }

    if (normalizedEntityId is not null)
    {
        filters["entityId"] = normalizedEntityId;
    }

    var distinctLogIds = selectedLogIds?.Distinct().ToArray();
    if (distinctLogIds is { Length: > 0 })
    {
        filters["selectedLogIds"] = distinctLogIds;
    }

    return filters;
}

static string? NormalizeOptionalText(string? value) =>
    string.IsNullOrWhiteSpace(value) ? null : value.Trim();

static ResourceLogDetail ChooseAnchorLog(IReadOnlyList<ResourceLogDetail> logs) =>
    logs
        .OrderByDescending(log => ParseLevelValue(log.Level))
        .ThenByDescending(log => log.Time)
        .First();

static int ParseLevelValue(string? level) =>
    int.TryParse(level, out var parsedLevel) ? parsedLevel : -1;

public partial class Program { }

public sealed record LoginRequest(string Username, string Password);
public sealed record DatasetRegistrationRequest(string Name);

// API key authentication handler - reads user config and attaches dataset claims.
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
