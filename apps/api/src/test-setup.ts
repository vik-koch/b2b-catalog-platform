import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Unit/integration specs import modules that read the validated env (env.ts) at
// load time, so give them the minimum server-mode config before that runs. Uses
// `??=` so anything already set in the real environment wins.
process.env['API_PORT'] ??= '3000';
process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/test';
process.env['MAIL_HOST'] ??= 'localhost';
process.env['MAIL_PORT'] ??= '1025';
process.env['MAIL_FROM'] ??= 'Test Shop <no-reply@example.test>';
process.env['MAIL_STAFF_TO'] ??= 'shop@example.test';
process.env['JWT_SECRET'] ??= 'test-only-jwt-secret-at-least-32-chars-long';
// The rate limits are pinned rather than inherited: the workspace .env lifts
// them for the e2e suite, and the throttling spec asserts that the ceiling
// actually stops the eleventh request.
process.env['PUBLIC_FORM_RATE_LIMIT'] = '10';
process.env['AUTH_RATE_LIMIT'] = '10';
// A throwaway dir for the LocalMediaStore. Assigned, never `??=`: the spec
// deletes this directory between cases, and the workspace .env points
// MEDIA_ROOT at ./.media — the images the local dev stack serves. Inheriting it
// here means `nx test api` wipes them, and any file already there fails the
// spec that asserts the store wrote exactly one. Per-pid so parallel workers
// and a crashed previous run cannot collide.
process.env['MEDIA_ROOT'] = join(tmpdir(), `b2b-media-test-${process.pid}`);
