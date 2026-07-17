// Nx loads the root .env before starting the dev server, so the proxy target
// follows API_HOST/API_PORT without duplicating the port here.
const { API_HOST, API_PORT } = process.env;

if (!API_HOST || !API_PORT) {
  throw new Error(
    'API_HOST and API_PORT must be set — copy .env.example to .env at the workspace root',
  );
}

module.exports = {
  '/api': {
    target: `http://${API_HOST}:${API_PORT}`,
    secure: false,
    changeOrigin: true,
  },
};
