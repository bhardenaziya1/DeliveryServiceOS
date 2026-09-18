import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  path: string;
  icon: SvgIconComponent;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: DashboardOutlinedIcon },
  { label: 'Clients', path: '/clients', icon: BusinessOutlinedIcon },
  { label: 'Projects', path: '/projects', icon: AssignmentOutlinedIcon },
];

export const SIDEBAR_WIDTH = 260;
