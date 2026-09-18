import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema, TypeOf } from 'zod';

export class ZodValidationPipe<S extends ZodSchema> implements PipeTransform<unknown, TypeOf<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): TypeOf<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
