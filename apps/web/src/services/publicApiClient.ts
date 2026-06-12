import axios from 'axios';

let base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api';
if (!base.endsWith('/api') && !base.endsWith('/api/')) {
  base = `${base.replace(/\/$/, '')}/api`;
}
const API_URL = `${base.replace(/\/$/, '')}/public`;

const publicApiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default publicApiClient;
