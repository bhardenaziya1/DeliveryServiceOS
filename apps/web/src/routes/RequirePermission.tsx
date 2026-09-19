import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { Permission } from '@vendoros/shared';
import { useAuth } from '../features/auth/AuthContext';

interface RequirePermissionProps {
  /** The user needs at least one of these. */
  anyOf: Permission[];
  /** Rendered instead of the route when the check fails. */
  fallback?: ReactNode;
  children?: ReactNode;
}

/**
 * Hides a route from users who cannot use it.
 *
 * This is a usability layer, not a security one: the same permission is
 * enforced by `PermissionsGuard` on the API, and every one of those checks is
 * covered by `rbac.e2e-spec.ts`. Removing this component would make the app
 * uglier, not less safe.
 */
export function RequirePermission({ anyOf, fallback, children }: RequirePermissionProps) {
  const { hasAnyPermission } = useAuth();

  if (!hasAnyPermission(...anyOf)) {
    return <>{fallback ?? <Navigate to="/" replace />}</>;
  }

  return <>{children ?? <Outlet />}</>;
}

/**
 * Renders its children only when the user holds one of the permissions.
 *
 * For in-page affordances - a "New client" button, a delete icon - so the UI
 * offers only what the backend will actually accept.
 */
export function Can({
  anyOf,
  children,
  fallback = null,
}: {
  anyOf: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasAnyPermission } = useAuth();
  return <>{hasAnyPermission(...anyOf) ? children : fallback}</>;
}
