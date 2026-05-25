"""
Error handling utilities for FastAPI endpoints
"""

from typing import Any, Callable
from fastapi import HTTPException, status
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class ServiceException(Exception):
    """Base exception for service errors"""
    
    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: str | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.detail = detail or message
        super().__init__(self.message)


class ValidationError(ServiceException):
    """Validation error exception"""
    
    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message, status.HTTP_400_BAD_REQUEST, detail)


class NotFoundError(ServiceException):
    """Not found error exception"""
    
    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message, status.HTTP_404_NOT_FOUND, detail)


class DatabaseError(ServiceException):
    """Database error exception"""
    
    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE, detail)


class ServiceUnavailableError(ServiceException):
    """Service unavailable error exception"""
    
    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE, detail)


def handle_service_error(func: Callable) -> Callable:
    """
    Decorator to handle service errors in endpoint handlers
    """
    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await func(*args, **kwargs)
        except ServiceException as e:
            logger.error(f"Service error in {func.__name__}: {e.message}", exc_info=True)
            raise HTTPException(status_code=e.status_code, detail=e.detail)
        except ValueError as e:
            logger.warning(f"Validation error in {func.__name__}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Unexpected error in {func.__name__}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred"
            )
    return wrapper


def handle_sync_service_error(func: Callable) -> Callable:
    """
    Decorator to handle service errors in synchronous endpoint handlers
    """
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except ServiceException as e:
            logger.error(f"Service error in {func.__name__}: {e.message}", exc_info=True)
            raise HTTPException(status_code=e.status_code, detail=e.detail)
        except ValueError as e:
            logger.warning(f"Validation error in {func.__name__}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Unexpected error in {func.__name__}: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred"
            )
    return wrapper


def log_error(message: str, exception: Exception | None = None, context: dict[str, Any] | None = None) -> None:
    """
    Log an error with optional context
    """
    log_data = {
        "message": message,
        **(context or {})
    }
    
    if exception:
        logger.error(f"{message}: {str(exception)}", exc_info=exception, extra=log_data)
    else:
        logger.error(message, extra=log_data)
