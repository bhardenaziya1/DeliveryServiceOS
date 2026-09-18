import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { loginSchema, type LoginInput } from '@vendoros/shared';
import { useAuth } from './AuthContext';
import { useLoginMutation } from './useLoginMutation';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { colors } from '../../theme/theme';

const HIGHLIGHTS = [
  { icon: GroupsOutlinedIcon, label: 'Manage workforce' },
  { icon: LocalShippingOutlinedIcon, label: 'Track fleet' },
  { icon: DescriptionOutlinedIcon, label: 'Handle contracts' },
  { icon: PaymentsOutlinedIcon, label: 'Reconcile payments' },
  { icon: TrendingUpOutlinedIcon, label: 'Grow profitability' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const loginMutation = useLoginMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await loginMutation.mutateAsync(values);
      login(session.accessToken, session.user);
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

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
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Stack spacing={0.5} sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={700}>
              Welcome back
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to your VendorOS account
            </Typography>
          </Stack>

          <Box component="form" onSubmit={onSubmit} noValidate>
            <Stack spacing={2}>
              {formError && <Alert severity="error">{formError}</Alert>}

              <TextField
                label="Email address"
                type="email"
                autoComplete="email"
                fullWidth
                autoFocus
                {...register('email')}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />

              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                fullWidth
                {...register('password')}
                error={Boolean(errors.password)}
                helperText={errors.password?.message}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting}
                fullWidth
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
