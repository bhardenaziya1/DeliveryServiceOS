import {
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS, SIDEBAR_WIDTH } from './navConfig';

export function Sidebar() {
  const location = useLocation();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        display: { xs: 'none', md: 'block' },
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          bgcolor: '#151d2e',
          color: '#e6e9f0',
          borderRight: 'none',
        },
      }}
    >
      <Toolbar>
        <Typography variant="h6" fontWeight={700} color="inherit">
          VendorOS
        </Typography>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <List sx={{ px: 1, py: 2 }}>
        {NAV_ITEMS.map((item) => {
          const selected =
            item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={selected}
              sx={{
                borderRadius: 1.5,
                mb: 0.5,
                color: 'inherit',
                '&.Mui-selected': {
                  bgcolor: 'rgba(255,255,255,0.12)',
                },
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.08)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Drawer>
  );
}
