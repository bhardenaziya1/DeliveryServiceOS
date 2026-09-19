import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppException } from '../../common/errors/app.exception';
import { HealthService } from './health.service';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';
import { type DependencyHealth, type LivenessResult, type ReadinessResult } from './health.types';
import { Public } from '../../common/rbac/rbac.decorators';

/**
 * Health endpoints are intentionally unauthenticated so that load balancers,
 * uptime monitors and container orchestrators can reach them. They expose
 * status and latency only - never connection strings or credentials.
 */
@Public()
@ApiTags('health')
@ApiStandardErrorResponses()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns 200 whenever the process can serve HTTP. Does not touch dependencies.',
  })
  @ApiOkResponse({ description: 'The API process is alive.' })
  liveness(): LivenessResult {
    return this.health.liveness();
  }

  @Get('db')
  @ApiOperation({ summary: 'PostgreSQL connectivity probe' })
  @ApiOkResponse({ description: 'The database answered a `SELECT 1`.' })
  @ApiServiceUnavailableResponse({ description: 'The database is unreachable.' })
  async database(): Promise<DependencyHealth> {
    return assertUp('database', await this.health.checkDatabase());
  }

  @Get('redis')
  @ApiOperation({ summary: 'Redis connectivity probe' })
  @ApiOkResponse({ description: 'Redis answered a `PING`.' })
  @ApiServiceUnavailableResponse({ description: 'Redis is unreachable.' })
  async redis(): Promise<DependencyHealth> {
    return assertUp('redis', await this.health.checkRedis());
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Aggregates every dependency. Returns 503 while any of them is down.',
  })
  @ApiOkResponse({ description: 'Every dependency is reachable.' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is down.' })
  async readiness(): Promise<ReadinessResult> {
    const result = await this.health.readiness();

    if (result.status !== 'ok') {
      const down = Object.entries(result.dependencies)
        .filter(([, dependency]) => dependency.status === 'down')
        .map(([name]) => name);

      throw AppException.dependencyUnavailable(`Dependencies unavailable: ${down.join(', ')}`, {
        ...result.dependencies,
      });
    }

    return result;
  }
}

function assertUp(name: string, result: DependencyHealth): DependencyHealth {
  if (result.status === 'down') {
    throw AppException.dependencyUnavailable(`${name} is unavailable`, { ...result });
  }
  return result;
}
