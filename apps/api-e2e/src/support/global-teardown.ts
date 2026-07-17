import { killPort } from '@nx/node/utils';
import { requireEnv } from './env';
/* eslint-disable */

module.exports = async function () {
  // The API process is managed by Nx (continuous api:serve dependency) and the
  // Postgres container stays up for local development — nothing to stop here
  // besides making sure the port is released when the server was started
  // outside of Nx.
  const port = Number(requireEnv('API_PORT'));
  try {
    await killPort(port);
  } catch {
    // Port already released — fine.
  }
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
