import axios from 'axios';

let base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api';
if (!base.endsWith('/api') && !base.endsWith('/api/')) {
  base = `${base.replace(/\/$/, '')}/api`;
}
const API_URL = base;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens, etc.
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const payload = error?.response?.data;
    const message =
      (typeof payload === 'object' && payload?.message) ||
      error?.message ||
      'Unknown API error';

    // Keep diagnostics without triggering noisy overlay traces from console.error.
    console.warn('API Warning:', { status, message, payload });
    return Promise.reject(error);
  }
);

export default apiClient;
