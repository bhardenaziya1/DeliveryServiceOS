import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './envelope.dto';

/**
 * Documents the error envelope every endpoint can return, so the generated
 * OpenAPI spec matches what the exception filter actually emits.
 */
export function ApiStandardErrorResponses(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({ status: 400, description: 'Validation failed.', type: ApiErrorResponseDto }),
    ApiResponse({
      status: 401,
      description: 'Missing or invalid credentials.',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Insufficient role for this operation.',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found in this tenant.',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 409,
      description: 'Conflicts with an existing record.',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 500,
      description: 'Unexpected server error.',
      type: ApiErrorResponseDto,
    }),
  );
}
