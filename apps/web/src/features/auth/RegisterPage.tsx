import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import {
  PASSWORD_MIN_LENGTH,
  registerSchema,
  slugifyTenantName,
  type RegisterInput,
} from '@vendoros/shared';
import { useAuth } from './AuthContext';
import { useRegisterMutation } from './api';
import { AuthLayout } from './AuthLayout';
import { extractApiErrorMessage, extractApiFieldErrors } from '../../lib/apiClient';

/**
 * Public sign-up: creates the company (tenant) and its first Super Admin.
 *
 * Joining an existing company is an invitation, never a form - otherwise
 * anyone who knew a tenant slug could put themselves inside it.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const registerMutation = useRegisterMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const tenantName = watch('tenantName');
  // Previewed with the same function the API uses, so what is shown is what
  // will be allocated.
  const slugPreview = tenantName ? slugifyTenantName(tenantName) : '';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await registerMutation.mutateAsync(values);
      signIn(session);
      navigate('/', { replace: true });
    } catch (error) {
      const fieldErrors = extractApiFieldErrors(error);
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (field in values && messages[0]) {
          setError(field as keyof RegisterInput, { message: messages[0] });
        }
      }
      setFormError(extractApiErrorMessage(error));
    }
  });

  return (
    <AuthLayout
      title="Create your company account"
      subtitle="You will be the first Super Admin and can invite your team afterwards."
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            label="Company name"
            fullWidth
            autoFocus
            {...register('tenantName')}
            error={Boolean(errors.tenantName)}
            helperText={
              errors.tenantName?.message ??
              (slugPreview ? `Your workspace: ${slugPreview}` : 'Your registered trade name')
            }
          />

          <TextField
            label="Your full name"
            autoComplete="name"
            fullWidth
            {...register('fullName')}
            error={Boolean(errors.fullName)}
            helperText={errors.fullName?.message}
          />

          <TextField
            label="Work email"
            type="email"
            autoComplete="email"
            fullWidth
            {...register('email')}
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
          />

          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            fullWidth
            {...register('password')}
            error={Boolean(errors.password)}
            helperText={
              errors.password?.message ??
              `At least ${PASSWORD_MIN_LENGTH} characters, with upper and lower case and a number`
            }
          />

          <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>

          <Typography variant="body2" color="text.secondary" textAlign="center">
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" underline="hover">
              Sign in
            </Link>
          </Typography>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
