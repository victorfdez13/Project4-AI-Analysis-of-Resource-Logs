using System;
using System.Collections.Generic;

namespace Project4_AI_Analysis_of_Resource_Logs.Contracts;

/// <summary>
/// Standard API error response
/// </summary>
public record ApiErrorResponse(
    int StatusCode,
    string Message,
    string ErrorType = "Error",
    Dictionary<string, object>? Details = null,
    string? TraceId = null
);

/// <summary>
/// Service health status response
/// </summary>
public record ServiceHealthResponse(
    string Status,
    string Service,
    Dictionary<string, object>? Details = null,
    string? Message = null
);

/// <summary>
/// Validation error details
/// </summary>
public record ValidationErrorDetail(
    string Field,
    string Message,
    object? Value = null
);

/// <summary>
/// Paginated response wrapper
/// </summary>
public record PaginatedResponse<T>(
    List<T> Data,
    int PageNumber,
    int PageSize,
    int TotalCount,
    int TotalPages
);
