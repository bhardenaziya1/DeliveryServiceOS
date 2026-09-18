import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { map, type Observable } from 'rxjs';
import { type ApiSuccessResponse } from '@vendoros/shared';
import { resolveRequestId, setRequestIdHeader } from '../http/request-id';

/**
 * Wraps every successful HTTP payload in the standard success envelope.
 *
 * Handlers returning `undefined` (e.g. `204 No Content`) are passed through
 * untouched - a body on a no-content response would be invalid.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = resolveRequestId(request);
    setRequestIdHeader(response, requestId);

    return next.handle().pipe(
      map((data) => {
        if (data === undefined) {
          return data;
        }

        return {
          success: true as const,
          data,
          meta: { requestId, timestamp: new Date().toISOString() },
        };
      }),
    );
  }
}
