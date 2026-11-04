import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as z from 'zod';
import { SYNC_MAX_UPLOAD_BYTES } from '@b2b-catalog-platform/shared/core/exchange';
import { SyncFormatError } from './csv-file';

export interface SyncUpload<O, P> {
  options: O;
  parsed: P;
  filename: string | null;
}

/**
 * A sync upload read by its area's options schema and parser. The options
 * travel as a JSON string field, since multipart has no JSON body; the
 * submission's own schema checks them, so a file cannot ask for what a
 * submission could not.
 */
export function readSyncUpload<S extends z.ZodType, P>(
  file: Express.Multer.File | undefined,
  rawOptions: string | undefined,
  schema: S,
  parse: (text: string) => P,
): SyncUpload<z.output<S>, P> {
  if (!file) {
    throw new BadRequestException({
      code: 'no-file',
      message: 'No file uploaded (field "file")',
    });
  }
  if (file.size > SYNC_MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeException({
      code: 'file-too-large',
      message: 'The file exceeds the size limit',
      params: { limit: String(SYNC_MAX_UPLOAD_BYTES) },
    });
  }
  const options = parseOptions(rawOptions, schema);
  try {
    const parsed = parse(file.buffer.toString('utf8'));
    return { options, parsed, filename: file.originalname ?? null };
  } catch (error) {
    if (!(error instanceof SyncFormatError)) throw error;
    throw new BadRequestException({
      code: error.code,
      message: error.message,
      params: error.params,
    });
  }
}

function parseOptions<S extends z.ZodType>(
  raw: string | undefined,
  schema: S,
): z.output<S> {
  let value: unknown = {};
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      throw optionsInvalid('The "options" field is not valid JSON');
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw optionsInvalid(result.error.issues.map((i) => i.message).join('; '));
  }
  return result.data;
}

const optionsInvalid = (message: string) =>
  new BadRequestException({ code: 'options-invalid', message });
