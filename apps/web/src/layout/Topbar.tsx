import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { useNavigate } from 'react-router-dom';
import { getSystemRole, isRoleKey } from '@vendoros/shared';
import { useAuth } from '../features/auth/AuthContext';
import { SIDEBAR_WIDTH } from './navConfig';

interface TopbarProps {
  /** Opens the mobile navigation drawer. Only rendered below `md`. */
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const { user, tenant, signOut } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Roles are labels here, never a permission check - the sidebar and the API
  // decide what is reachable.
  const roleLabel = (user?.roles ?? [])
    .map((role) => (isRoleKey(role) ? getSystemRole(role).name : role))
    .join(', ');

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="inherit"
      sx={{
        width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        ml: { md: `${SIDEBAR_WIDTH}px` },
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', gap: 2 }}>
        <IconButton
          onClick={onOpenMobileNav}
          edge="start"
          aria-label="Open navigation"
          sx={{ display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <TextField
          placeholder="Search anything…"
          size="small"
          sx={{
            display: { xs: 'none', sm: 'block' },
            width: 320,
            '& .MuiOutlinedInput-root': { bgcolor: 'background.default', borderRadius: 2 },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
          <IconButton size="small">
            <NotificationsNoneOutlinedIcon />
          </IconButton>
          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" fontWeight={600}>
              {user?.fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {roleLabel}
            </Typography>
          </Box>
          <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} size="small">
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
              {initials}
            </Avatar>
          </IconButton>
        </Box>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <MenuItem disabled sx={{ display: 'block', opacity: '1 !important' }}>
            <Typography variant="body2" fontWeight={600}>
              {user?.email}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tenant?.name}
            </Typography>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              navigate('/profile');
            }}
          >
            <ListItemIcon>
              <PersonOutlineIcon fontSize="small" />
            </ListItemIcon>
            Your profile
          </MenuItem>
          <MenuItem
            onClick={async () => {
              setAnchorEl(null);
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            <ListItemIcon>
              <LogoutOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
