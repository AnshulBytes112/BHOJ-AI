import axios from 'axios';

let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api';
if (!API_URL.endsWith('/public')) {
  API_URL = `${API_URL.replace(/\/$/, '')}/public`;
}

const publicApiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default publicApiClient;
