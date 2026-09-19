import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERMISSIONS, ROLES } from '@vendoros/shared';
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

/** A successful `/auth/login` response, in the envelope the client unwraps. */
function loginResponse() {
  return {
    status: 200,
    data: {
      success: true,
      data: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 900,
        tokenType: 'Bearer',
        sessionId: 'session-1',
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'owner@demo-vendor.ae',
          fullName: 'Demo Owner',
          emailVerified: true,
          roles: [ROLES.SUPER_ADMIN],
          permissions: [PERMISSIONS.CLIENTS_READ],
          lastLoginAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        tenant: { id: 'tenant-1', name: 'Demo Vendor', slug: 'demo-vendor' },
      },
      meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z' },
    },
  };
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/enter your password/i)).toBeInTheDocument();
  });

  it('does not hold an existing password to the new-password policy', async () => {
    // A password set before the policy tightened must still be submittable -
    // the server decides, and tells the user to rotate it.
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(loginResponse());
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'owner@demo-vendor.ae');
    await user.type(screen.getByLabelText(/^password/i), 'short');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(post).toHaveBeenCalled());
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
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('stores both tokens and the identity on a successful login', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(loginResponse());
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'owner@demo-vendor.ae');
    await user.type(screen.getByLabelText(/^password/i), 'DemoPassword123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('vendoros.accessToken')).toBe('test-access-token');
    });
    expect(localStorage.getItem('vendoros.refreshToken')).toBe('test-refresh-token');
    expect(JSON.parse(localStorage.getItem('vendoros.user') ?? '{}')).toMatchObject({
      email: 'owner@demo-vendor.ae',
      roles: [ROLES.SUPER_ADMIN],
    });
  });

  it('sends the remember-me choice to the API', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(loginResponse());
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'owner@demo-vendor.ae');
    await user.type(screen.getByLabelText(/^password/i), 'DemoPassword123!');
    await user.click(screen.getByLabelText(/keep me signed in/i));
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [path, body] = post.mock.calls[0] ?? [];
    expect(path).toBe('/auth/login');
    expect(body).toMatchObject({ rememberMe: true });
  });

  it('offers a route to password recovery and sign-up', () => {
    renderLoginPage();

    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: /create a company account/i })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
