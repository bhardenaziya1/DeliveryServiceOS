import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';

const PING_TIMEOUT_MS = 2_000;

/**
 * Owns the single shared Redis connection.
 *
 * Redis is a supporting dependency (caching, queues, rate limiting), so a
 * Redis outage must not stop the API from booting: the connection is lazy, and
 * the readiness endpoint - not the process - reports the degraded state.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(
    config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisService.name);
    this.client = new Redis(config.get('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5_000,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });

    // Without a listener, ioredis surfaces connection errors as unhandled
    // 'error' events and crashes the process.
    this.client.on('error', (error: Error) => {
      this.logger.warn({ err: error }, 'Redis connection error');
    });
    this.client.on('ready', () => {
      this.logger.info('Redis connection ready');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      this.logger.warn({ err: error }, 'Redis unavailable at startup; continuing in degraded mode');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }

  /** Round-trips a PING. Resolves to the latency in ms, or throws. */
  async ping(): Promise<number> {
    const startedAt = Date.now();
    const result = await withTimeout(this.client.ping(), PING_TIMEOUT_MS, 'Redis PING timed out');

    if (result !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${result}`);
    }
    return Date.now() - startedAt;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
