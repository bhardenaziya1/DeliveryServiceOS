import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import { PERMISSIONS, type Permission } from '@vendoros/shared';

export interface NavItem {
  label: string;
  path: string;
  icon: SvgIconComponent;
  /**
   * The item is shown when the user holds at least one of these. An empty
   * list means "everyone who is signed in".
   *
   * These are the same permissions the matching API routes require, so the
   * menu never offers a page that would answer 403.
   */
  anyOf: Permission[];
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: 'Dashboard', path: '/', icon: DashboardOutlinedIcon, anyOf: [] }],
  },
  {
    heading: 'Commercial',
    items: [
      {
        label: 'Clients',
        path: '/clients',
        icon: BusinessOutlinedIcon,
        anyOf: [PERMISSIONS.CLIENTS_READ],
      },
      {
        label: 'Projects',
        path: '/projects',
        icon: AssignmentOutlinedIcon,
        anyOf: [PERMISSIONS.PROJECTS_READ],
      },
    ],
  },
  {
    heading: 'Administration',
    items: [
      {
        label: 'Team',
        path: '/users',
        icon: GroupsOutlinedIcon,
        anyOf: [PERMISSIONS.USERS_READ],
      },
      {
        label: 'Audit log',
        path: '/audit-logs',
        icon: HistoryOutlinedIcon,
        anyOf: [PERMISSIONS.AUDIT_READ],
      },
      {
        label: 'Settings',
        path: '/settings',
        icon: SettingsOutlinedIcon,
        anyOf: [PERMISSIONS.TENANT_UPDATE],
      },
    ],
  },
];

/**
 * The sections a user can actually see.
 *
 * A section whose every item is hidden is dropped along with its heading -
 * otherwise a Viewer sees an "Administration" label with nothing under it.
 */
export function visibleSections(
  hasAnyPermission: (...permissions: Permission[]) => boolean,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.anyOf.length === 0 || hasAnyPermission(...item.anyOf),
    ),
  })).filter((section) => section.items.length > 0);
}

export const SIDEBAR_WIDTH = 260;
