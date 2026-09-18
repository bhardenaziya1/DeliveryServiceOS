import { type PipeTransform } from '@nestjs/common';
import { type TypeOf, type ZodSchema } from 'zod';
import { type ApiFieldErrors } from '@vendoros/shared';
import { AppException } from '../errors/app.exception';

/**
 * Validates and coerces a request payload against a shared Zod schema.
 *
 * Failures are raised as `AppException`s so they land in the standard error
 * envelope with `code: VALIDATION_ERROR` and per-field messages.
 */
export class ZodValidationPipe<S extends ZodSchema> implements PipeTransform<unknown, TypeOf<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): TypeOf<S> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const flattened = result.error.flatten();
      const fieldErrors: ApiFieldErrors = {};

      for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
        if (messages && messages.length > 0) {
          fieldErrors[field] = messages;
        }
      }
      if (flattened.formErrors.length > 0) {
        fieldErrors['_'] = flattened.formErrors;
      }

      throw AppException.validation('Validation failed', fieldErrors);
    }

    return result.data;
  }
}
