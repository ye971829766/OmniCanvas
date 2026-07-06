import axios, { type AxiosError, type AxiosInstance } from 'axios';

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
  (config) => {
    const token = localStorage.getItem("omnicanvas_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
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
