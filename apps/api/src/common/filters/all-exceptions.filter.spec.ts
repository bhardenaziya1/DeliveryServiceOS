import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { type ApiErrorResponse } from '@vendoros/shared';
import { AppException } from '../errors/app.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(url = '/api/v1/clients') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status, json, setHeader: jest.fn(), headersSent: false, end: jest.fn() };
  const request = { method: 'POST', url, originalUrl: url, headers: {}, id: 'req-test' };

  return {
    host: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    },
    response,
    body: (): ApiErrorResponse => json.mock.calls[0]?.[0] as ApiErrorResponse,
    statusCode: (): number => status.mock.calls[0]?.[0] as number,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logger: { setContext: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter = new AllExceptionsFilter(logger as any);
  });

  it('maps an AppException onto the envelope', () => {
    const ctx = createHost();

    filter.catch(AppException.notFound('Client'), ctx.host as never);

    expect(ctx.statusCode()).toBe(HttpStatus.NOT_FOUND);
    expect(ctx.body()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Client not found' },
      meta: { requestId: 'req-test', path: '/api/v1/clients' },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('carries field errors from a validation failure', () => {
    const ctx = createHost();

    filter.catch(
      AppException.validation('Validation failed', { legalName: ['Legal name is required'] }),
      ctx.host as never,
    );

    expect(ctx.statusCode()).toBe(HttpStatus.BAD_REQUEST);
    expect(ctx.body().error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fieldErrors: { legalName: ['Legal name is required'] },
    });
  });

  it('converts a raw ZodError into field errors', () => {
    const ctx = createHost();
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'nope' });

    filter.catch(result.success ? new Error('unreachable') : result.error, ctx.host as never);

    expect(ctx.statusCode()).toBe(HttpStatus.BAD_REQUEST);
    expect(ctx.body().error.code).toBe('VALIDATION_ERROR');
    expect(ctx.body().error.fieldErrors?.['email']).toBeDefined();
  });

  it('maps built-in Nest exceptions by status', () => {
    const ctx = createHost();

    filter.catch(new ForbiddenException('Not your tenant'), ctx.host as never);

    expect(ctx.statusCode()).toBe(HttpStatus.FORBIDDEN);
    expect(ctx.body().error).toEqual({ code: 'FORBIDDEN', message: 'Not your tenant' });
  });

  it('maps a unique-constraint violation to 409 with the offending fields', () => {
    const ctx = createHost();
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.20.0',
      meta: { target: ['tenantId', 'code'] },
    });

    filter.catch(error, ctx.host as never);

    expect(ctx.statusCode()).toBe(HttpStatus.CONFLICT);
    expect(ctx.body().error.code).toBe('CONFLICT');
    expect(ctx.body().error.details).toEqual({ fields: ['tenantId', 'code'] });
  });

  it('maps a missing record to 404', () => {
    const ctx = createHost();
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.20.0',
    });

    filter.catch(error, ctx.host as never);

    expect(ctx.statusCode()).toBe(HttpStatus.NOT_FOUND);
  });

  it('never leaks an unexpected error message, and logs it', () => {
    const ctx = createHost();

    filter.catch(new Error('connection string postgres://user:pa55w0rd@db'), ctx.host as never);

    expect(ctx.statusCode()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(ctx.body().error.code).toBe('INTERNAL_ERROR');
    expect(ctx.body().error.message).not.toMatch(/pa55w0rd/);
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not leak the message of a 5xx HttpException either', () => {
    const ctx = createHost();

    filter.catch(
      new HttpException('upstream payroll gateway timed out at 10.0.0.4', 502),
      ctx.host as never,
    );

    expect(ctx.statusCode()).toBe(502);
    expect(ctx.body().error.message).not.toMatch(/10\.0\.0\.4/);
  });

  it('stops after ending the response when headers were already sent', () => {
    const ctx = createHost();
    ctx.response.headersSent = true;

    filter.catch(new NotFoundException(), ctx.host as never);

    expect(ctx.response.status).not.toHaveBeenCalled();
    expect(ctx.response.end).toHaveBeenCalled();
  });
});
