import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { API_ERROR_CODES, type ApiErrorCode } from '@vendoros/shared';

/**
 * Swagger-only mirrors of the shared response envelope.
 *
 * The runtime contract lives in `@vendoros/shared`; these classes exist purely
 * so `@nestjs/swagger` (which reads decorator metadata, not TypeScript types)
 * can emit schemas for it.
 */
export class ApiResponseMetaDto {
  @ApiProperty({
    description: 'Correlation id, also returned in the `x-request-id` header.',
    example: '4f1c6c2e-7a1d-4f0b-9f4e-7c0e5d9a1b23',
  })
  requestId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-31T09:15:00.000Z' })
  timestamp!: string;
}

export class ApiErrorMetaDto extends ApiResponseMetaDto {
  @ApiProperty({ description: 'Request path that produced the error.', example: '/api/v1/clients' })
  path!: string;
}

export class ApiErrorPayloadDto {
  @ApiProperty({ enum: API_ERROR_CODES, example: 'VALIDATION_ERROR' })
  code!: ApiErrorCode;

  @ApiProperty({ description: 'Human-readable message, safe to display.' })
  message!: string;

  @ApiPropertyOptional({
    description: 'Per-field validation messages, keyed by field path.',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { legalName: ['Legal name is required'] },
  })
  fieldErrors?: Record<string, string[]>;

  @ApiPropertyOptional({
    description: 'Extra machine-readable context. Never contains secrets.',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ApiErrorPayloadDto })
  error!: ApiErrorPayloadDto;

  @ApiProperty({ type: ApiErrorMetaDto })
  meta!: ApiErrorMetaDto;
}

export class ApiSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ description: 'Endpoint-specific payload.' })
  data!: unknown;

  @ApiProperty({ type: ApiResponseMetaDto })
  meta!: ApiResponseMetaDto;
}
