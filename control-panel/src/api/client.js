/**
 * Shared Axios instance. Every data call in the app goes through this client.
 * Requests reach the real platform backend through the Vite `/api` proxy
 * (see vite.config.js); this instance sets timeout/headers and normalizes
 * errors so UI code can rely on `error.message`.
 *
 * @author Quasar
 */
import axios from 'axios';

const client = axios.create({
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

// Normalise errors so UI code can rely on `error.message`.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Request failed, please try again.';
    return Promise.reject(Object.assign(error, { message }));
  },
);

export default client;
