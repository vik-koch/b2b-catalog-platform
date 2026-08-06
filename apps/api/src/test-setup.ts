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
// A throwaway dir for the LocalMediaStore; its spec writes and cleans up here.
process.env['MEDIA_ROOT'] ??= join(tmpdir(), 'b2b-media-test');
