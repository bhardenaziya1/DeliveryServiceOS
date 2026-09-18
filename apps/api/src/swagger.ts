import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ApiErrorMetaDto,
  ApiErrorPayloadDto,
  ApiErrorResponseDto,
  ApiResponseMetaDto,
  ApiSuccessResponseDto,
} from './common/swagger/envelope.dto';

export interface SwaggerSetupOptions {
  /** API global prefix, e.g. `api/v1`. Docs are served beneath it. */
  prefix: string;
  version: string;
}

/**
 * Mounts Swagger UI at `<prefix>/docs` and the raw spec at
 * `<prefix>/docs-json`. Disabled in production unless `SWAGGER_ENABLED=true`.
 */
export function setupSwagger(app: INestApplication, options: SwaggerSetupOptions): string {
  const path = `${options.prefix}/docs`;

  const config = new DocumentBuilder()
    .setTitle('VendorOS API')
    .setDescription(
      [
        'Multi-tenant SaaS operating system for UAE manpower/fleet vendors.',
        '',
        'Every response uses the standard envelope: successes are',
        '`{ success: true, data, meta }` and failures are',
        '`{ success: false, error: { code, message, fieldErrors?, details? }, meta }`.',
        'Branch on `error.code`, never on the message text.',
        '',
        'All business endpoints are tenant-scoped from the bearer token; a tenant id',
        'is never accepted from the request body or query string.',
      ].join('\n'),
    )
    .setVersion(options.version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' }, 'bearer')
    .addTag('health', 'Liveness and dependency readiness probes')
    .addTag('auth', 'Authentication and session issuance')
    .addTag('clients', 'Client companies the tenant supplies workforce and fleet to')
    .addTag('projects', 'Engagements under a client')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      ApiSuccessResponseDto,
      ApiErrorResponseDto,
      ApiErrorPayloadDto,
      ApiResponseMetaDto,
      ApiErrorMetaDto,
    ],
  });

  SwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `${path}-json`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  return path;
}
