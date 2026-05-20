/**
 * Enhanced API request wrapper with error handling
 */

import {
  ApiError,
  handleFetchResponse,
  parseApiError,
  NetworkError,
  logError
} from './errorUtils';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://127.0.0.1:5005"
).replace(/\/+$/, "");
const API_KEY = import.meta.env.VITE_API_KEY?.trim() || "key-admin-full";

/**
 * Build full URL with query parameters
 */
export function buildUrl(path, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
}

/**
 * Make JSON request with comprehensive error handling
 */
export async function requestJson(path, query = {}, options = {}) {
  const headers = {
    Accept: "application/json",
    ...options.headers,
  };

  if (API_KEY && !headers["X-Api-Key"]) {
    headers["X-Api-Key"] = API_KEY;
  }

  const url = buildUrl(path, query);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const responseText = await response.text();
    
    try {
      await handleFetchResponse(response, responseText);
    } catch (error) {
      logError(error, { path, method: options.method || 'GET' });
      throw error;
    }

    const payload = JSON.parse(responseText);
    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new NetworkError(
        'Network request failed. Please check your connection.',
        { originalError: error.message }
      );
      logError(networkError, { path });
      throw networkError;
    }

    const apiError = new ApiError(
      'Failed to parse server response',
      500,
      { originalError: error.message }
    );
    logError(apiError, { path });
    throw apiError;
  }
}

/**
 * Make GET request with error handling
 */
export async function getJson(path, query = {}) {
  return requestJson(path, query, { method: 'GET' });
}

/**
 * Make POST request with error handling
 */
export async function postJson(path, body = {}, query = {}) {
  return requestJson(path, query, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Make PUT request with error handling
 */
export async function putJson(path, body = {}, query = {}) {
  return requestJson(path, query, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Make DELETE request with error handling
 */
export async function deleteJson(path, query = {}) {
  return requestJson(path, query, { method: 'DELETE' });
}

/**
 * Validate API connectivity
 */
export async function validateApiConnection() {
  try {
    const result = await getJson('/health');
    return { connected: true, data: result };
  } catch (error) {
    return { 
      connected: false, 
      error: error.message,
      status: error.status 
    };
  }
}
