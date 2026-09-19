import { describe, expect, it } from 'vitest';
import { permissionsForRoles, ROLES, type Permission, type RoleKey } from '@vendoros/shared';
import { visibleSections } from './navConfig';

/**
 * The menu is derived from the same permission set the API enforces, so what a
 * role can see here matches what it can actually do. `rbac.e2e-spec.ts` is the
 * other half of this: it proves the backend rejects the rest.
 */
function navigationFor(...roles: RoleKey[]): string[] {
  const granted = new Set<string>(permissionsForRoles(roles));
  const hasAnyPermission = (...required: Permission[]) =>
    required.length === 0 || required.some((permission) => granted.has(permission));

  return visibleSections(hasAnyPermission).flatMap((section) =>
    section.items.map((item) => item.label),
  );
}

describe('visibleSections', () => {
  it('shows a Super Admin everything', () => {
    expect(navigationFor(ROLES.SUPER_ADMIN)).toEqual([
      'Dashboard',
      'Clients',
      'Projects',
      'Team',
      'Audit log',
      'Settings',
    ]);
  });

  it('hides tenant Settings from an Admin, who cannot change them', () => {
    const navigation = navigationFor(ROLES.ADMIN);

    expect(navigation).toContain('Team');
    expect(navigation).toContain('Audit log');
    expect(navigation).not.toContain('Settings');
  });

  it('shows a Viewer only what they can read', () => {
    expect(navigationFor(ROLES.VIEWER)).toEqual(['Dashboard', 'Clients', 'Projects']);
  });

  it('gives an Operations Manager the commercial pages but no audit log', () => {
    const navigation = navigationFor(ROLES.OPS_MANAGER);

    expect(navigation).toContain('Clients');
    expect(navigation).toContain('Projects');
    expect(navigation).toContain('Team');
    expect(navigation).not.toContain('Audit log');
  });

  it('gives a Finance Manager the audit log', () => {
    expect(navigationFor(ROLES.FINANCE_MANAGER)).toContain('Audit log');
  });

  it('never hides the Dashboard, which needs no permission', () => {
    for (const role of Object.values(ROLES)) {
      expect(navigationFor(role)).toContain('Dashboard');
    }
  });

  it('drops a section heading once every item under it is hidden', () => {
    const granted = new Set<string>(permissionsForRoles([ROLES.VIEWER]));
    const sections = visibleSections(
      (...required: Permission[]) =>
        required.length === 0 || required.some((permission) => granted.has(permission)),
    );

    expect(sections.map((section) => section.heading)).not.toContain('Administration');
    expect(sections.every((section) => section.items.length > 0)).toBe(true);
  });

  it('combines the permissions of multiple roles', () => {
    // An Accountant alone cannot see the audit log; adding HR/Compliance does.
    expect(navigationFor(ROLES.ACCOUNTANT)).not.toContain('Audit log');
    expect(navigationFor(ROLES.ACCOUNTANT, ROLES.HR_COMPLIANCE)).toContain('Audit log');
  });
});
