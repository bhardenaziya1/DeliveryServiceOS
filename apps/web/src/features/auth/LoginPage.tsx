import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { loginSchema, type LoginInput } from '@vendoros/shared';
import { useAuth } from './AuthContext';
import { useLoginMutation } from './api';
import { AuthLayout } from './AuthLayout';
import { extractApiErrorMessage } from '../../lib/apiClient';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const loginMutation = useLoginMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  });

  // Return the user to whatever they were trying to reach before the redirect.
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await loginMutation.mutateAsync(values);
      signIn(session);
      navigate(redirectTo && redirectTo !== '/login' ? redirectTo : '/', { replace: true });
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your VendorOS account">
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

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <FormControlLabel
              control={<Checkbox {...register('rememberMe')} />}
              label={<Typography variant="body2">Keep me signed in</Typography>}
            />
            <Link component={RouterLink} to="/forgot-password" variant="body2" underline="hover">
              Forgot password?
            </Link>
          </Stack>

          <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <Typography variant="body2" color="text.secondary" textAlign="center">
            New to VendorOS?{' '}
            <Link component={RouterLink} to="/register" underline="hover">
              Create a company account
            </Link>
          </Typography>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
