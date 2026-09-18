import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Request, type Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import {
  API_ERROR_STATUS,
  apiErrorCodeForStatus,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiFieldErrors,
} from '@vendoros/shared';
import { AppException } from '../errors/app.exception';
import { resolveRequestId, setRequestIdHeader } from '../http/request-id';

interface NormalisedError {
  status: number;
  code: ApiErrorCode;
  message: string;
  fieldErrors?: ApiFieldErrors;
  details?: Record<string, unknown>;
  /** Only 5xx and genuinely unexpected errors are logged at error level. */
  logAsError: boolean;
}

const GENERIC_MESSAGE = 'An unexpected error occurred. Please try again.';

/**
 * The single place where any thrown value becomes an HTTP response.
 *
 * Registered through `APP_FILTER` so it is active in the running app *and* in
 * tests that import `AppModule`, and so it can take the logger by injection.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const normalised = this.normalise(exception);
    const requestId = resolveRequestId(request);

    const logPayload = {
      requestId,
      status: normalised.status,
      code: normalised.code,
      method: request.method,
      path: request.originalUrl ?? request.url,
    };

    if (normalised.logAsError) {
      // Only unexpected failures carry the full error (stack included); an
      // expected 4xx would otherwise bury real problems in noise.
      this.logger.error({ ...logPayload, err: exception }, normalised.message);
    } else {
      this.logger.warn(logPayload, normalised.message);
    }

    // The response may already be streaming (e.g. an error thrown mid-stream);
    // nothing useful can be sent at that point.
    if (response.headersSent) {
      response.end();
      return;
    }

    setRequestIdHeader(response, requestId);

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: normalised.code,
        message: normalised.message,
        ...(normalised.fieldErrors ? { fieldErrors: normalised.fieldErrors } : {}),
        ...(normalised.details ? { details: normalised.details } : {}),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
      },
    };

    response.status(normalised.status).json(body);
  }

  private normalise(exception: unknown): NormalisedError {
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      return {
        status,
        code: exception.code,
        message: exception.message,
        ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
        ...(exception.details ? { details: exception.details } : {}),
        logAsError: status >= HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: API_ERROR_STATUS.VALIDATION_ERROR,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fieldErrors: toFieldErrors(exception),
        logAsError: false,
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnownError(exception);
    }

    if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError
    ) {
      return {
        status: API_ERROR_STATUS.DEPENDENCY_UNAVAILABLE,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'The database is currently unavailable. Please try again shortly.',
        logAsError: true,
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // A malformed query is a bug in our code, not a client error; never echo
      // the raw message because it contains the query shape.
      return {
        status: API_ERROR_STATUS.INTERNAL_ERROR,
        code: 'INTERNAL_ERROR',
        message: GENERIC_MESSAGE,
        logAsError: true,
      };
    }

    return {
      status: API_ERROR_STATUS.INTERNAL_ERROR,
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
      logAsError: true,
    };
  }

  private fromHttpException(exception: HttpException): NormalisedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const code = apiErrorCodeForStatus(status);
    const logAsError = status >= HttpStatus.INTERNAL_SERVER_ERROR;

    // A 5xx message is for the logs, never for the client.
    if (typeof payload === 'string') {
      return { status, code, message: logAsError ? GENERIC_MESSAGE : payload, logAsError };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record['message'];

    // Nest's ValidationPipe reports an array of messages.
    if (Array.isArray(rawMessage)) {
      return {
        status,
        code: status === HttpStatus.BAD_REQUEST ? 'VALIDATION_ERROR' : code,
        message: 'Validation failed',
        fieldErrors: { _: rawMessage.map(String) },
        logAsError,
      };
    }

    const message =
      typeof rawMessage === 'string' && rawMessage.length > 0
        ? rawMessage
        : (exception.message ?? GENERIC_MESSAGE);

    const fieldErrors = isFieldErrors(record['fieldErrors'])
      ? record['fieldErrors']
      : isFieldErrors(record['errors'])
        ? record['errors']
        : undefined;

    return {
      status,
      code: fieldErrors ? 'VALIDATION_ERROR' : code,
      // 5xx thrown as an HttpException still must not leak internals.
      message: logAsError ? GENERIC_MESSAGE : message,
      ...(fieldErrors ? { fieldErrors } : {}),
      logAsError,
    };
  }

  private fromPrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): NormalisedError {
    const target = normaliseTarget(exception.meta?.['target']);

    switch (exception.code) {
      case 'P2002':
        return {
          status: API_ERROR_STATUS.CONFLICT,
          code: 'CONFLICT',
          message: target.length
            ? `A record with this ${target.join(', ')} already exists`
            : 'A record with these details already exists',
          ...(target.length ? { details: { fields: target } } : {}),
          logAsError: false,
        };
      case 'P2003':
      case 'P2014':
        return {
          status: API_ERROR_STATUS.CONFLICT,
          code: 'CONFLICT',
          message: 'This record is referenced by other records and cannot be changed',
          logAsError: false,
        };
      case 'P2025':
        return {
          status: API_ERROR_STATUS.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested record no longer exists',
          logAsError: false,
        };
      case 'P2000':
        return {
          status: API_ERROR_STATUS.VALIDATION_ERROR,
          code: 'VALIDATION_ERROR',
          message: 'One of the provided values is too long',
          logAsError: false,
        };
      default:
        return {
          status: API_ERROR_STATUS.INTERNAL_ERROR,
          code: 'INTERNAL_ERROR',
          message: GENERIC_MESSAGE,
          logAsError: true,
        };
    }
  }
}

function toFieldErrors(error: ZodError): ApiFieldErrors {
  const flattened = error.flatten();
  const fieldErrors: ApiFieldErrors = {};

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (messages && messages.length > 0) {
      fieldErrors[field] = messages;
    }
  }
  if (flattened.formErrors.length > 0) {
    fieldErrors['_'] = flattened.formErrors;
  }

  return fieldErrors;
}

function isFieldErrors(value: unknown): value is ApiFieldErrors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((item) => typeof item === 'string'),
  );
}

function normaliseTarget(target: unknown): string[] {
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof target === 'string' ? [target] : [];
}
