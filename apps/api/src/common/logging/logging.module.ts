import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { type Request, type Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { REQUEST_ID_HEADER, resolveRequestId } from '../http/request-id';

/**
 * Structured (JSON) logging with a correlation id on every line.
 *
 * - An inbound `x-request-id` is honoured so a trace survives across services;
 *   otherwise a UUID is generated. Either way it is echoed in the response
 *   header and included in the API response envelope.
 * - Health probes are not auto-logged; they would otherwise dominate the log.
 * - Credentials and tokens are redacted rather than relying on reviewers to
 *   never log a request body.
 */
@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      providers: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: (req, res) => {
            const requestId = resolveRequestId(req);
            res.setHeader(REQUEST_ID_HEADER, requestId);
            return requestId;
          },
          customProps: (req) => ({ requestId: (req as Request).id }),
          autoLogging: {
            ignore: (req) => (req.url ?? '').includes('/health'),
          },
          customSuccessMessage: (req, res) =>
            `${(req as Request).method} ${req.url} ${res.statusCode}`,
          customErrorMessage: (req, res) =>
            `${(req as Request).method} ${req.url} ${res.statusCode}`,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.token',
              'req.body.refreshToken',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          serializers: {
            req: (req: Request & { raw?: Request }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: Response) => ({ statusCode: res.statusCode }),
          },
          ...(config.get('LOG_PRETTY')
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                },
              }
            : {}),
        },
      }),
    }),
  ],
  // Global + re-exported so PinoLogger can be injected anywhere (services,
  // filters, interceptors) without importing this module in every feature.
  exports: [LoggerModule],
})
export class LoggingModule {}
