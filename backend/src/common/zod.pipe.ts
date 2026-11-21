import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { Errors } from './errors';

/** Validates and transforms request data with a Zod schema; failures become 400 VALIDATION_ERROR. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw Errors.validation(result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    return result.data;
  }
}
