import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { SIDEBAR_WIDTH, visibleSections } from './navConfig';
import { useAuth } from '../features/auth/AuthContext';
import { colors } from '../theme/theme';

interface SidebarProps {
  /** Whether the mobile (temporary) drawer is open. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

/**
 * Primary navigation. Rendered twice: a permanent drawer from `md` up, and a
 * temporary overlay drawer on small screens, so navigation is reachable at
 * every width.
 *
 * Items are filtered by the signed-in user's permissions, so the menu reflects
 * their role rather than listing pages the API would refuse to serve.
 */
export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const { hasAnyPermission } = useAuth();
  const sections = visibleSections(hasAnyPermission);

  const content = (
    <>
      <Toolbar>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            V
          </Box>
          <Typography variant="h6" fontWeight={700} color="inherit">
            VendorOS
          </Typography>
        </Stack>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <List sx={{ px: 1.5, py: 2 }}>
        {sections.map((section, index) => (
          <Box key={section.heading ?? `section-${index}`} sx={{ mb: 1 }}>
            {section.heading && (
              <Typography
                variant="overline"
                sx={{
                  px: 1.5,
                  color: 'rgba(230,233,240,0.45)',
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                {section.heading}
              </Typography>
            )}
            {section.items.map((item) => {
              const selected =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
              const Icon = item.icon;
              return (
                <ListItemButton
                  key={item.path}
                  component={NavLink}
                  to={item.path}
                  selected={selected}
                  onClick={onMobileClose}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    color: 'rgba(230,233,240,0.85)',
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: '#fff',
                      '&:hover': { bgcolor: 'primary.main' },
                    },
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.08)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                    <Icon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
                </ListItemButton>
              );
            })}
          </Box>
        ))}
      </List>
    </>
  );

  const paperSx = {
    width: SIDEBAR_WIDTH,
    boxSizing: 'border-box' as const,
    bgcolor: colors.navy,
    color: '#e6e9f0',
    borderRight: 'none',
  };

  return (
    <Box component="nav" aria-label="Main navigation">
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': paperSx,
        }}
      >
        {content}
      </Drawer>

      <Drawer
        variant="permanent"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': paperSx,
        }}
      >
        {content}
      </Drawer>
    </Box>
  );
}
