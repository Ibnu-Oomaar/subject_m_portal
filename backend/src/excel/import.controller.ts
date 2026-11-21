import { Body, Controller, Get, HttpCode, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { Auth, Roles } from '../common/decorators';
import { Errors } from '../common/errors';
import { uuidSchema } from '../common/schemas';
import type { AuthContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { XLSX_MIME } from './excel.service';
import { ImportService } from './import.service';
import { MAX_IMPORT_BYTES } from './import-parser';

const previewBody = z.object({ academicYearId: uuidSchema });
type PreviewBody = z.infer<typeof previewBody>;
const commitBody = z.object({ token: uuidSchema, skipInvalid: z.boolean().default(false) });
type CommitBody = z.infer<typeof commitBody>;

interface UploadedFileLike {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Student import: upload -> preview (nothing is saved) -> explicit confirmation (commit). */
@Controller('imports/students')
@Roles('teacher')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get('template')
  async template(): Promise<StreamableFile> {
    const buffer = await this.imports.template();
    return new StreamableFile(buffer, { type: XLSX_MIME, disposition: 'attachment; filename="student-import-template.xlsx"', length: buffer.length });
  }

  /** Creates no resource (only a short-lived preview token), so it answers 200 rather than 201. */
  @Post('preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 5 } }))
  preview(@Auth() auth: AuthContext, @UploadedFile() file: UploadedFileLike | undefined, @Body(new ZodPipe(previewBody)) body: PreviewBody) {
    if (!file) throw Errors.badRequest('Choose an Excel (.xlsx) or CSV (.csv) file to upload.', undefined, 'FILE_REQUIRED');
    // multer decodes file names as latin1; only the extension is used for format detection, and the name is shown back as text
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.imports.preview(auth, name, file.buffer, body.academicYearId);
  }

  @Post('commit')
  commit(@Auth() auth: AuthContext, @Body(new ZodPipe(commitBody)) body: CommitBody) {
    return this.imports.commit(auth, body.token, body.skipInvalid);
  }
}
