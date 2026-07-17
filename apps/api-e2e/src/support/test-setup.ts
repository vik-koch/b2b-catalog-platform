/* eslint-disable */
import axios from 'axios';
import { requireEnv } from './env';

module.exports = async function () {
  // Configure axios for tests to use.
  const host = requireEnv('API_HOST');
  const port = requireEnv('API_PORT');
  axios.defaults.baseURL = `http://${host}:${port}/api`;
};
