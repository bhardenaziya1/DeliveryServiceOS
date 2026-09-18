import { useState } from 'react';
import { Box, Toolbar } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SIDEBAR_WIDTH } from './navConfig';

/**
 * Application shell: persistent navigation plus the routed page.
 *
 * The mobile drawer's open state lives here because both the Topbar (which
 * toggles it) and the Sidebar (which renders it) need it.
 */
export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
      <Box
        component="main"
        sx={{ flexGrow: 1, minWidth: 0, width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` } }}
      >
        {/* Spacer matching the fixed AppBar height. */}
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
