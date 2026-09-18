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
import SearchIcon from '@mui/icons-material/Search';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { SIDEBAR_WIDTH } from './navConfig';

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

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
              {user?.role}
            </Typography>
          </Box>
          <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} size="small">
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
              {initials}
            </Avatar>
          </IconButton>
        </Box>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <MenuItem disabled>{user?.email}</MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              logout();
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
