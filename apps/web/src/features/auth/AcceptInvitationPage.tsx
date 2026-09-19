import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, passwordSchema, isRoleKey, getSystemRole } from '@vendoros/shared';
import { useAuth } from './AuthContext';
import { useAcceptInvitationMutation, useInvitationPreviewQuery } from './api';
import { AuthLayout } from './AuthLayout';
import { extractApiErrorMessage } from '../../lib/apiClient';

const formSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  password: passwordSchema,
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Where an invited user sets their password and joins the tenant.
 *
 * The roles shown are read-only: they come from the invitation the admin
 * created, and the API takes them from that record rather than from anything
 * this form submits.
 */
export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { signIn } = useAuth();

  const preview = useInvitationPreviewQuery(token);
  const acceptInvitation = useAcceptInvitationMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { fullName: preview.data?.fullName ?? '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return;
    setFormError(null);
    try {
      const session = await acceptInvitation.mutateAsync({ token, ...values });
      signIn(session);
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

  if (!token || preview.isError) {
    return (
      <AuthLayout title="This invitation is not valid">
        <Stack spacing={2}>
          <Alert severity="error">
            {token
              ? 'This invitation has expired, has already been used, or was withdrawn. Ask your administrator to send a new one.'
              : 'This invitation link is missing its token.'}
          </Alert>
          <Link component={RouterLink} to="/login" underline="hover">
            Back to sign in
          </Link>
        </Stack>
      </AuthLayout>
    );
  }

  if (preview.isLoading || !preview.data) {
    return (
      <AuthLayout title="Checking your invitation…">
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${preview.data.tenantName}`}
      subtitle={`Set a password for ${preview.data.email} to accept your invitation.`}
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}

          <Box>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              You have been invited as
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {preview.data.roles.map((role) => (
                <Chip
                  key={role}
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={isRoleKey(role) ? getSystemRole(role).name : role}
                />
              ))}
            </Stack>
          </Box>

          <TextField
            label="Your full name"
            autoComplete="name"
            fullWidth
            {...register('fullName')}
            error={Boolean(errors.fullName)}
            helperText={errors.fullName?.message}
          />

          <TextField
            label="Choose a password"
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
            {isSubmitting ? 'Joining…' : 'Accept invitation'}
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
