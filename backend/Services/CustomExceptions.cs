using System;
using System.Collections.Generic;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

/// <summary>
/// Custom exception for application errors
/// </summary>
public class ApplicationException : Exception
{
    public int? HttpStatusCode { get; set; }
    public Dictionary<string, object>? Details { get; set; }

    public ApplicationException(string message, int? statusCode = null, Dictionary<string, object>? details = null)
        : base(message)
    {
        HttpStatusCode = statusCode ?? 500;
        Details = details;
    }
}

/// <summary>
/// Exception for validation errors
/// </summary>
public class ValidationException : ApplicationException
{
    public ValidationException(string message, Dictionary<string, object>? details = null)
        : base(message, 400, details)
    {
    }
}

/// <summary>
/// Exception for authentication errors
/// </summary>
public class AuthenticationException : ApplicationException
{
    public AuthenticationException(string message = "Authentication failed")
        : base(message, 401)
    {
    }
}

/// <summary>
/// Exception for authorization errors
/// </summary>
public class AuthorizationException : ApplicationException
{
    public AuthorizationException(string message = "Access denied")
        : base(message, 403)
    {
    }
}

/// <summary>
/// Exception for not found errors
/// </summary>
public class NotFoundException : ApplicationException
{
    public NotFoundException(string message = "Resource not found")
        : base(message, 404)
    {
    }
}

/// <summary>
/// Exception for database/service unavailability
/// </summary>
public class ServiceUnavailableException : ApplicationException
{
    public ServiceUnavailableException(string message = "Service unavailable")
        : base(message, 503)
    {
    }

    public ServiceUnavailableException(string message, Exception innerException)
        : base(message, 503)
    {
    }
}
