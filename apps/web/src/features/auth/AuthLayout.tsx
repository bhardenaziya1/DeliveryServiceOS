import { Box, Stack, Typography } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import type { ReactNode } from 'react';
import { colors } from '../../theme/theme';

const HIGHLIGHTS = [
  { icon: GroupsOutlinedIcon, label: 'Manage workforce' },
  { icon: LocalShippingOutlinedIcon, label: 'Track fleet' },
  { icon: DescriptionOutlinedIcon, label: 'Handle contracts' },
  { icon: PaymentsOutlinedIcon, label: 'Reconcile payments' },
  { icon: TrendingUpOutlinedIcon, label: 'Grow profitability' },
];

/**
 * The split-screen shell every signed-out screen uses.
 *
 * Extracted so login, sign-up, password reset and invitation acceptance stay
 * visually identical - they are the same moment in the product, and drifting
 * layouts make a reset link feel like a phishing page.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          width: '45%',
          px: 6,
          py: 8,
          bgcolor: colors.navy,
          color: '#fff',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
            }}
          >
            V
          </Box>
          <Typography variant="h5" fontWeight={800}>
            VendorOS
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 5 }}>
          Simplify Operations. Maximize Profitability.
        </Typography>
        <Stack spacing={2.5}>
          {HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <Stack key={label} direction="row" alignItems="center" spacing={1.5}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Icon fontSize="small" />
              </Box>
              <Typography variant="body1" fontWeight={500}>
                {label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          px: 2,
          py: 4,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          <Stack spacing={0.5} sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={700}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Stack>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
