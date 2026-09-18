import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';

/**
 * Global configuration.
 *
 * Files are read in order and the first definition of a variable wins, so an
 * API-local override beats the shared monorepo-root `.env`:
 *   apps/api/.env.local -> apps/api/.env -> <root>/.env.local -> <root>/.env
 *
 * `validate` runs before anything else is constructed, so an invalid
 * environment aborts the boot with a list of exactly which variables are wrong.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        '.env.local',
        '.env',
        resolve(__dirname, '../../../../.env.local'),
        resolve(__dirname, '../../../../.env'),
      ],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
