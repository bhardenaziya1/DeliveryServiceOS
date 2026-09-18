import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppEnv } from './env.schema';

/** Fully-typed config accessor - no string keys or `any` at the call sites. */
export type TypedConfigService = ConfigService<AppEnv, true>;

@Injectable()
export class AppConfigService {
  // `TypedConfigService` is a type alias, so `emitDecoratorMetadata` would
  // record `Object` for this parameter; the explicit token is what makes DI
  // resolve it.
  constructor(@Inject(ConfigService) private readonly config: TypedConfigService) {}

  get<K extends keyof AppEnv>(key: K): AppEnv[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }
}
