/**
 * Error handling utilities for API requests and error standardization
 */

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, details);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Network request failed', details = null) {
    super(message, 0, details);
    this.name = 'NetworkError';
  }
}

/**
 * Parse error response from API
 */
export function parseApiError(response, responseText) {
  try {
    const payload = JSON.parse(responseText);
    return payload?.message || payload?.detail || payload?.title || responseText || null;
  } catch {
    return responseText || null;
  }
}

/**
 * Handle fetch response and throw appropriate error
 */
export async function handleFetchResponse(response, responseText) {
  if (response.ok) {
    return responseText;
  }

  const errorMessage = parseApiError(response, responseText);
  const message = errorMessage || `Request failed with HTTP ${response.status}`;

  switch (response.status) {
    case 400:
      throw new ValidationError(message);
    case 401:
      throw new AuthenticationError(message);
    case 403:
      throw new AuthorizationError(message);
    case 404:
      throw new NotFoundError(message);
    case 500:
    case 502:
    case 503:
    case 504:
      throw new ApiError(`Server error: ${message}`, response.status);
    default:
      throw new ApiError(message, response.status);
  }
}

/**
 * Format error message for display
 */
export function formatErrorMessage(error) {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof TypeError) {
    if (error.message.includes('fetch')) {
      return 'Network error. Please check your connection and try again.';
    }
    return 'An unexpected error occurred.';
  }

  if (error instanceof Error) {
    return error.message || 'An unexpected error occurred.';
  }

  return String(error);
}

/**
 * Retry logic with exponential backoff
 */
export async function retryAsync(
  fn,
  maxRetries = 3,
  delayMs = 1000,
  backoffMultiplier = 2
) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry client errors (4xx)
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt);
        console.warn(
          `Request failed (attempt ${attempt + 1}/${maxRetries + 1}). ` +
          `Retrying in ${delay}ms...`,
          error
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Log error to console or service
 */
export function logError(error, context = {}) {
  const timestamp = new Date().toISOString();
  const errorData = {
    timestamp,
    message: formatErrorMessage(error),
    name: error?.name || 'Unknown',
    status: error?.status,
    ...context
  };

  console.error('[Error]', errorData);

  // Send to error tracking service if available
  if (window.__logError) {
    try {
      window.__logError(errorData);
    } catch (logError) {
      console.error('Failed to log error to service:', logError);
    }
  }
}
