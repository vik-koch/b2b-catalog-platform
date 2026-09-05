// Nx loads the root .env before starting the dev server, so the proxy target
// follows API_HOST/API_PORT without duplicating the port here.
const { API_HOST, API_PORT, MEDIA_PORT } = process.env;

if (!API_HOST || !API_PORT || !MEDIA_PORT) {
  throw new Error(
    'API_HOST, API_PORT and MEDIA_PORT must be set — copy .env.example to .env at the workspace root',
  );
}

module.exports = {
  '/api': {
    target: `http://${API_HOST}:${API_PORT}`,
    secure: false,
    changeOrigin: true,
  },
  // Uploaded images are served by the media nginx from compose.db.yml, not the
  // api — matching production, where /media is a static route beside /api.
  '/media': {
    target: `http://${API_HOST}:${MEDIA_PORT}`,
    secure: false,
    changeOrigin: true,
  },
  // Product documents, from the same nginx under their own prefix.
  '/documents': {
    target: `http://${API_HOST}:${MEDIA_PORT}`,
    secure: false,
    changeOrigin: true,
  },
};
