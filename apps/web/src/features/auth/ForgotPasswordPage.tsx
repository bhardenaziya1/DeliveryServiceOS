import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@vendoros/shared';
import { useForgotPasswordMutation } from './api';
import { AuthLayout } from './AuthLayout';
import { extractApiErrorMessage } from '../../lib/apiClient';

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPasswordMutation();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await forgotPassword.mutateAsync(values);
      setSubmitted(true);
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

  if (submitted) {
    return (
      <AuthLayout title="Check your email">
        <Stack spacing={2}>
          {/* Deliberately does not say whether the address is registered - the
              API does not either, so that this page cannot be used to discover
              which accounts exist. */}
          <Alert severity="success">
            If that address belongs to a VendorOS account, a password reset link is on its way. The
            link expires shortly and can only be used once.
          </Alert>
          <Link component={RouterLink} to="/login" underline="hover">
            Back to sign in
          </Link>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your work email and we will send you a link."
    >
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

          <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>

          <Link component={RouterLink} to="/login" variant="body2" underline="hover">
            Back to sign in
          </Link>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
