import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { type DependencyHealth, type LivenessResult, type ReadinessResult } from './health.types';

const SERVICE_NAME = 'vendoros-api';
const SERVICE_VERSION: string = process.env['npm_package_version'] ?? '0.1.0';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  /** Process-level liveness: answers "is the HTTP server up?" and nothing more. */
  liveness(): LivenessResult {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: this.config.get('NODE_ENV'),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async checkDatabase(): Promise<DependencyHealth> {
    return probe(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }

  async checkRedis(): Promise<DependencyHealth> {
    return probe(async () => {
      await this.redis.ping();
    });
  }

  /** Readiness: every dependency the API needs to serve real traffic. */
  async readiness(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = database.status === 'up' && redis.status === 'up';

    return {
      status: healthy ? 'ok' : 'degraded',
      dependencies: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }
}

/** Runs a probe and converts any failure into a reportable status. */
async function probe(run: () => Promise<void>): Promise<DependencyHealth> {
  const startedAt = Date.now();
  try {
    await run();
    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
