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
      const userStr = localStorage.getItem('user');
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.role) {
            config.headers['x-role'] = user.role.toUpperCase();
          }
        } catch (e) {
          console.error('Failed to parse user from localStorage', e);
        }
      }
    }

    // Default to ADMIN if no role found to keep legacy behavior
    if (!config.headers['x-role']) {
      config.headers['x-role'] = 'ADMIN';
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
