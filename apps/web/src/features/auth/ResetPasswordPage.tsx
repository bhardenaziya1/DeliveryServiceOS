import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import { PASSWORD_MIN_LENGTH, passwordSchema } from '@vendoros/shared';
import { z } from 'zod';
import { useResetPasswordMutation } from './api';
import { AuthLayout } from './AuthLayout';
import { extractApiErrorMessage } from '../../lib/apiClient';

/** The token comes from the URL, so the form itself only collects a password. */
const formSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const resetPassword = useResetPasswordMutation();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ token, password: values.password });
      setDone(true);
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

  if (!token) {
    return (
      <AuthLayout title="That link is not valid">
        <Stack spacing={2}>
          <Alert severity="error">
            This password reset link is missing its token. Request a new one to continue.
          </Alert>
          <Link component={RouterLink} to="/forgot-password" underline="hover">
            Request a new link
          </Link>
        </Stack>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <Stack spacing={2}>
          <Alert severity="success">
            Your password has been changed and every signed-in session was ended. Sign in again with
            your new password.
          </Alert>
          <Button variant="contained" onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            fullWidth
            autoFocus
            {...register('password')}
            error={Boolean(errors.password)}
            helperText={
              errors.password?.message ??
              `At least ${PASSWORD_MIN_LENGTH} characters, with upper and lower case and a number`
            }
          />

          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            fullWidth
            {...register('confirmPassword')}
            error={Boolean(errors.confirmPassword)}
            helperText={errors.confirmPassword?.message}
          />

          <Button type="submit" variant="contained" size="large" disabled={isSubmitting} fullWidth>
            {isSubmitting ? 'Updating…' : 'Update password'}
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
