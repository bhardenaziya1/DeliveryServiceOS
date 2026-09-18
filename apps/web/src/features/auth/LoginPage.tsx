import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { loginSchema, type LoginInput } from '@vendoros/shared';
import { useAuth } from './AuthContext';
import { useLoginMutation } from './useLoginMutation';
import { extractApiErrorMessage } from '../../lib/apiClient';

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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Paper elevation={2} sx={{ p: 4, width: '100%', maxWidth: 420 }}>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            VendorOS
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to manage your workforce, fleet and client accounts.
          </Typography>
        </Stack>

        <Box component="form" onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Email"
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

            <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
