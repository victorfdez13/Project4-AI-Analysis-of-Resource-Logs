using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

var logs = new ConcurrentDictionary<int, ResourceLog>();
var nextId = 2;

logs[1] = new ResourceLog(1, "CPU", "Info", "CPU usage baseline registered.", "New", DateTimeOffset.UtcNow.AddMinutes(-20));
logs[2] = new ResourceLog(2, "Memory", "Warning", "Memory threshold exceeded during sample run.", "Open", DateTimeOffset.UtcNow.AddMinutes(-5));

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "backend"
}));

var logRoutes = app.MapGroup("/api/logs");

logRoutes.MapGet("/", () =>
{
    var items = logs.Values
        .OrderByDescending(log => log.CreatedAt)
        .ToList();

    return Results.Ok(items);
});

logRoutes.MapGet("/{id:int}", (int id) =>
{
    return logs.TryGetValue(id, out var log)
        ? Results.Ok(log)
        : Results.NotFound(new { message = $"Log with id {id} was not found." });
});

logRoutes.MapPost("/", (CreateResourceLogRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.ResourceName) ||
        string.IsNullOrWhiteSpace(request.Level) ||
        string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new
        {
            message = "resourceName, level, and message are required."
        });
    }

    var id = Interlocked.Increment(ref nextId);
    var log = new ResourceLog(
        id,
        request.ResourceName.Trim(),
        request.Level.Trim(),
        request.Message.Trim(),
        "New",
        DateTimeOffset.UtcNow);

    logs[id] = log;

    return Results.Created($"/api/logs/{id}", log);
});

logRoutes.MapPut("/{id:int}", (int id, UpdateResourceLogRequest request) =>
{
    if (!logs.TryGetValue(id, out var existing))
    {
        return Results.NotFound(new { message = $"Log with id {id} was not found." });
    }

    var updated = existing with
    {
        ResourceName = string.IsNullOrWhiteSpace(request.ResourceName) ? existing.ResourceName : request.ResourceName.Trim(),
        Level = string.IsNullOrWhiteSpace(request.Level) ? existing.Level : request.Level.Trim(),
        Message = string.IsNullOrWhiteSpace(request.Message) ? existing.Message : request.Message.Trim(),
        Status = string.IsNullOrWhiteSpace(request.Status) ? existing.Status : request.Status.Trim()
    };

    logs[id] = updated;

    return Results.Ok(updated);
});

logRoutes.MapDelete("/{id:int}", (int id) =>
{
    return logs.TryRemove(id, out _)
        ? Results.NoContent()
        : Results.NotFound(new { message = $"Log with id {id} was not found." });
});

app.Run();

record ResourceLog(
    int Id,
    string ResourceName,
    string Level,
    string Message,
    string Status,
    DateTimeOffset CreatedAt);

record CreateResourceLogRequest(
    string ResourceName,
    string Level,
    string Message);

record UpdateResourceLogRequest(
    string? ResourceName,
    string? Level,
    string? Message,
    string? Status);
