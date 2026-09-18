import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { AuthProvider } from './AuthContext';
import { apiClient } from '../../lib/apiClient';

function renderLoginPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
  });

  it('shows a server error message when credentials are rejected', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
          meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', path: '/auth/login' },
        },
      },
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'owner@demo-vendor.ae');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('stores the session and redirects on successful login', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          accessToken: 'test-token',
          user: {
            id: 'user-1',
            tenantId: 'tenant-1',
            email: 'owner@demo-vendor.ae',
            fullName: 'Demo Owner',
            role: 'OWNER',
          },
        },
        meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z' },
      },
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'owner@demo-vendor.ae');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('vendoros.accessToken')).toBe('test-token');
    });
  });
});
