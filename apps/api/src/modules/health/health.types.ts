export type DependencyStatus = 'up' | 'down';

export interface DependencyHealth {
  status: DependencyStatus;
  /** Round-trip latency of the probe query, in milliseconds. */
  latencyMs: number;
  /** Present only when `status` is `down`. */
  error?: string;
}

export interface LivenessResult {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
  };
  timestamp: string;
}
