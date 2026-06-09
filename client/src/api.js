import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
});

export function getAccessToken() {
  return localStorage.getItem('accessToken');
}

export function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

export function setAuthTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

export function clearAuthTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthTokens();
    return null;
  }

  const res = await axios.post('http://localhost:5000/api/auth/refresh', { refreshToken });
  setAuthTokens(res.data);
  return res.data.accessToken;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const canRefresh = error.response?.status === 403 && !originalRequest?._retry;

    if (!canRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const accessToken = await refreshAccessToken();
      if (!accessToken) return Promise.reject(error);
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAuthTokens();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
