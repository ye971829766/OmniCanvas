import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { encryptData, decryptData } from './cipher';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const request: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

request.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem("omnicanvas_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const isCryptoEnabled = import.meta.env.VITE_API_CRYPTO === 'true';
    if (isCryptoEnabled && config.data && !(config.data instanceof FormData)) {
      try {
        const encrypted = await encryptData(JSON.stringify(config.data));
        config.data = { encrypted };
        config.headers['X-API-Crypto'] = 'true';
      } catch (err) {
        console.error('Failed to encrypt request data:', err);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  async (response) => {
    const isCryptoEnabled = import.meta.env.VITE_API_CRYPTO === 'true';
    const isResponseEncrypted = response.headers['x-api-crypto'] === 'true';
    if (
      isCryptoEnabled &&
      isResponseEncrypted &&
      response.data &&
      response.data.encrypted
    ) {
      try {
        const decryptedStr = await decryptData(response.data.encrypted);
        response.data = JSON.parse(decryptedStr);
      } catch (err) {
        console.error('Failed to decrypt response data:', err);
      }
    }
    return response;
  },
  async (error: AxiosError) => {
    const isCryptoEnabled = import.meta.env.VITE_API_CRYPTO === 'true';
    if (error.response) {
      const isResponseEncrypted = error.response.headers['x-api-crypto'] === 'true';
      const data = error.response.data as any;
      if (isCryptoEnabled && isResponseEncrypted && data && data.encrypted) {
        try {
          const decryptedStr = await decryptData(data.encrypted);
          error.response.data = JSON.parse(decryptedStr);
        } catch (err) {
          console.error('Failed to decrypt error response data:', err);
        }
      }
    }

    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem("omnicanvas_token");
      window.dispatchEvent(new CustomEvent("omnicanvas:unauthorized"));
    }
    console.error('Request error:', error);
    return Promise.reject(error);
  },
);

export default request;
export { API_BASE_URL };
