import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';

const SERVICE_VERSION: string = process.env['npm_package_version'] ?? '0.1.0';

async function bootstrap(): Promise<void> {
  // `bufferLogs` holds startup logs until the pino logger is attached, so even
  // boot-time failures come out as structured JSON.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(AppConfigService);
  const prefix = config.get('API_PREFIX');

  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.setGlobalPrefix(prefix);
  // Lets Nest run OnModuleDestroy hooks (Prisma/Redis disconnect) on SIGTERM.
  app.enableShutdownHooks();

  const docsPath = config.get('SWAGGER_ENABLED')
    ? setupSwagger(app, { prefix, version: SERVICE_VERSION })
    : undefined;

  const port = config.get('PORT');
  await app.listen(port);

  logger.log({
    msg: 'VendorOS API started',
    port,
    environment: config.get('NODE_ENV'),
    healthUrl: `/${prefix}/health`,
    docsUrl: docsPath ? `/${docsPath}` : 'disabled',
  });
}

void bootstrap();
