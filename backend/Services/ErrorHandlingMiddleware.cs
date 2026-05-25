using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

/// <summary>
/// Middleware for handling and formatting errors globally
/// </summary>
public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Unhandled exception occurred");
            await HandleExceptionAsync(context, exception);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";

        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
        var (statusCode, errorType, message, details) = GetErrorDetails(exception);

        context.Response.StatusCode = statusCode;

        var response = new ApiErrorResponse(
            StatusCode: statusCode,
            Message: message,
            ErrorType: errorType,
            Details: details,
            TraceId: traceId
        );

        return context.Response.WriteAsJsonAsync(response);
    }

    private static (int, string, string, Dictionary<string, object>?) GetErrorDetails(Exception exception)
    {
        return exception switch
        {
            ValidationException ve => (
                ve.HttpStatusCode ?? 400,
                "ValidationError",
                ve.Message,
                ve.Details
            ),
            AuthenticationException ae => (
                ae.HttpStatusCode ?? 401,
                "AuthenticationError",
                ae.Message,
                ae.Details
            ),
            AuthorizationException ae => (
                ae.HttpStatusCode ?? 403,
                "AuthorizationError",
                ae.Message,
                ae.Details
            ),
            NotFoundException nfe => (
                nfe.HttpStatusCode ?? 404,
                "NotFoundError",
                nfe.Message,
                nfe.Details
            ),
            ServiceUnavailableException sue => (
                sue.HttpStatusCode ?? 503,
                "ServiceUnavailableError",
                sue.Message,
                sue.Details
            ),
            ApplicationException ae => (
                ae.HttpStatusCode ?? 500,
                "ApplicationError",
                ae.Message,
                ae.Details
            ),
            HttpRequestException hre => (
                (int)(hre.StatusCode ?? System.Net.HttpStatusCode.BadGateway),
                "HttpError",
                "External service error: " + hre.Message,
                new Dictionary<string, object> { { "originalMessage", hre.Message } }
            ),
            OperationCanceledException => (
                408,
                "TimeoutError",
                "Request timeout",
                null
            ),
            _ => (
                500,
                "InternalServerError",
                "An unexpected error occurred",
                new Dictionary<string, object>
                {
                    { "exceptionType", exception.GetType().Name },
                    { "details", exception.Message }
                }
            )
        };
    }
}

/// <summary>
/// Helper extension to add error handling middleware
/// </summary>
public static class ErrorHandlingMiddlewareExtensions
{
    public static IApplicationBuilder UseErrorHandling(this IApplicationBuilder app)
    {
        return app.UseMiddleware<ErrorHandlingMiddleware>();
    }
}
