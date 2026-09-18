import { HttpException } from '@nestjs/common';
import { API_ERROR_STATUS, type ApiErrorCode, type ApiFieldErrors } from '@vendoros/shared';

export interface AppExceptionOptions {
  /** Per-field messages for validation failures. */
  fieldErrors?: ApiFieldErrors;
  /** Extra machine-readable context. Must never contain secrets. */
  details?: Record<string, unknown>;
  /** Overrides the default status for the code. */
  status?: number;
  /** Original error, logged but never returned to the client. */
  cause?: unknown;
}

/**
 * The only exception type application code should throw.
 *
 * It carries the stable `ApiErrorCode` all the way to the exception filter, so
 * the HTTP status and the error envelope stay in lockstep.
 */
export class AppException extends HttpException {
  readonly code: ApiErrorCode;
  readonly fieldErrors: ApiFieldErrors | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ApiErrorCode, message: string, options: AppExceptionOptions = {}) {
    super(message, options.status ?? API_ERROR_STATUS[code], { cause: options.cause });
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
  }

  static validation(message: string, fieldErrors?: ApiFieldErrors): AppException {
    return new AppException('VALIDATION_ERROR', message, { fieldErrors });
  }

  static notFound(resource: string): AppException {
    return new AppException('NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppException {
    return new AppException('CONFLICT', message, { details });
  }

  static forbidden(message = 'You do not have access to this resource'): AppException {
    return new AppException('FORBIDDEN', message);
  }

  static unauthorized(message = 'Authentication required'): AppException {
    return new AppException('UNAUTHORIZED', message);
  }

  static dependencyUnavailable(message: string, details?: Record<string, unknown>): AppException {
    return new AppException('DEPENDENCY_UNAVAILABLE', message, { details });
  }
}
