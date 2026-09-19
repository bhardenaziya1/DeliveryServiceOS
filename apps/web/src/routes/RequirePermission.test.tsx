import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  PERMISSIONS,
  permissionsForRoles,
  ROLES,
  type AuthUser,
  type RoleKey,
} from '@vendoros/shared';
import { AuthProvider } from '../features/auth/AuthContext';
import { Can, RequirePermission } from './RequirePermission';

/** Seeds a signed-in session, the way a previous login would have. */
function signInAs(...roles: RoleKey[]) {
  const user: AuthUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@tenant.ae',
    fullName: 'Test User',
    emailVerified: true,
    roles,
    permissions: permissionsForRoles(roles),
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  localStorage.setItem('vendoros.accessToken', 'access');
  localStorage.setItem('vendoros.refreshToken', 'refresh');
  localStorage.setItem('vendoros.user', JSON.stringify(user));
  localStorage.setItem(
    'vendoros.tenant',
    JSON.stringify({ id: 'tenant-1', name: 'Tenant', slug: 'tenant' }),
  );
}

function renderWithAuth(ui: React.ReactNode, initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Can', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders an action the user is allowed to take', () => {
    signInAs(ROLES.ADMIN);

    renderWithAuth(
      <Can anyOf={[PERMISSIONS.CLIENTS_CREATE]}>
        <button type="button">New client</button>
      </Can>,
    );

    expect(screen.getByRole('button', { name: /new client/i })).toBeInTheDocument();
  });

  it('hides an action the user is not allowed to take', () => {
    signInAs(ROLES.VIEWER);

    renderWithAuth(
      <Can anyOf={[PERMISSIONS.CLIENTS_CREATE]}>
        <button type="button">New client</button>
      </Can>,
    );

    expect(screen.queryByRole('button', { name: /new client/i })).not.toBeInTheDocument();
  });

  it('renders the fallback instead when one is given', () => {
    signInAs(ROLES.VIEWER);

    renderWithAuth(
      <Can anyOf={[PERMISSIONS.CLIENTS_DELETE]} fallback={<span>Read-only access</span>}>
        <button type="button">Delete</button>
      </Can>,
    );

    expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
  });

  it('needs only one of several permissions', () => {
    signInAs(ROLES.ACCOUNTANT);

    renderWithAuth(
      <Can anyOf={[PERMISSIONS.PAYROLL_MANAGE, PERMISSIONS.INVOICES_MANAGE]}>
        <span>Billing tools</span>
      </Can>,
    );

    expect(screen.getByText(/billing tools/i)).toBeInTheDocument();
  });
});

describe('RequirePermission', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const routes = (
    <Routes>
      <Route path="/" element={<div>Dashboard</div>} />
      <Route element={<RequirePermission anyOf={[PERMISSIONS.AUDIT_READ]} />}>
        <Route path="/audit-logs" element={<div>Audit log page</div>} />
      </Route>
    </Routes>
  );

  it('renders the route for a user who holds the permission', () => {
    signInAs(ROLES.ADMIN);
    renderWithAuth(routes, '/audit-logs');

    expect(screen.getByText(/audit log page/i)).toBeInTheDocument();
  });

  it('redirects a user who does not', () => {
    signInAs(ROLES.VIEWER);
    renderWithAuth(routes, '/audit-logs');

    expect(screen.queryByText(/audit log page/i)).not.toBeInTheDocument();
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });
});
