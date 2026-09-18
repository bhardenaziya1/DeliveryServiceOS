import axios from 'axios';

export const AUTH_TOKEN_STORAGE_KEY = 'vendoros.accessToken';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type ApiErrorBody = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body?.errors) {
      const first = Object.values(body.errors).flat().find(Boolean);
      if (first) return first;
    }
    if (body?.message) return body.message;
  }
  return 'Something went wrong. Please try again.';
}
