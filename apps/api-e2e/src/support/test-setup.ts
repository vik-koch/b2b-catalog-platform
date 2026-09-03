import axios from 'axios';
import { requireEnv } from './env';

// Point every spec's axios at the API Nx is serving. A setup file is a module,
// so this runs once per worker before any spec in it.
const host = requireEnv('API_HOST');
const port = requireEnv('API_PORT');
axios.defaults.baseURL = `http://${host}:${port}/api`;
