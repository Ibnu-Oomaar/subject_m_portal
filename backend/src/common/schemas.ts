import { z } from 'zod';
import { ZodPipe } from './zod.pipe';

export const uuidSchema = z.uuid();
/** Use on @Param('id', uuidParam) so a malformed id is a clean 400, never a database error. */
export const uuidParam = new ZodPipe(uuidSchema);

export const termSchema = z.coerce.number().int().min(1).max(3);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Trimmed, single-spaced, non-empty text. */
export const cleanText = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'This field is required').max(max, `Must be at most ${max} characters`));
