import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';

/**
 * Owns the Prisma connection pool for the whole process.
 *
 * Prisma's own warnings/errors are forwarded to the structured logger instead
 * of going to stdout unstructured.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly logger: PinoLogger) {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    this.logger.setContext(PrismaService.name);

    this.$on('warn', (event) => this.logger.warn({ target: event.target }, event.message));
    this.$on('error', (event) => this.logger.error({ target: event.target }, event.message));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
