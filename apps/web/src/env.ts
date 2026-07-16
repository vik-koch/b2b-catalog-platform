/**
 * Server-side only: `process` does not exist in the browser bundle, so this
 * must only be called from the Node entry point (server.ts) or inside an
 * `isPlatformServer` branch.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set — copy .env.example to .env at the workspace root`,
    );
  }
  return value;
}
