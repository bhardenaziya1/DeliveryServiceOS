import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { useSnackbar } from 'notistack';
import {
  changePasswordSchema,
  getSystemRole,
  isRoleKey,
  PASSWORD_MIN_LENGTH,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type UserDto,
} from '@vendoros/shared';
import { useAuth } from '../auth/AuthContext';
import {
  SESSIONS_QUERY_KEY,
  useChangePasswordMutation,
  useResendVerificationMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
} from '../auth/api';
import { api, extractApiErrorMessage, extractApiFieldErrors } from '../../lib/apiClient';
import { PageHeader } from '../../components/PageHeader';

export function ProfilePage() {
  const { user, tenant, refreshCurrentUser, signOut } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const sessions = useSessionsQuery();
  const revokeSession = useRevokeSessionMutation();
  const resendVerification = useResendVerificationMutation();

  if (!user || !tenant) return null;

  return (
    <Stack spacing={3}>
      <PageHeader title="Your profile" subtitle={`${user.email} · ${tenant.name}`} />

      {!user.emailVerified && (
        <Alert
          severity="warning"
          action={
            <Button
              size="small"
              onClick={async () => {
                await resendVerification.mutateAsync();
                enqueueSnackbar('Verification email sent', { variant: 'success' });
              }}
            >
              Resend
            </Button>
          }
        >
          Your email address has not been confirmed yet.
        </Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Details
          </Typography>
          <ProfileDetailsForm
            fullName={user.fullName}
            onSaved={async () => {
              await refreshCurrentUser();
              enqueueSnackbar('Profile updated', { variant: 'success' });
            }}
          />

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle2" gutterBottom>
            Your roles
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            {user.roles.map((role) => (
              <Chip
                key={role}
                icon={<VerifiedUserOutlinedIcon />}
                label={isRoleKey(role) ? getSystemRole(role).name : role}
                color="primary"
                variant="outlined"
                size="small"
              />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            These roles grant {user.permissions.length} permissions. Roles are assigned by an
            administrator.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Changing your password signs out every other device. This one stays signed in.
          </Typography>
          <ChangePasswordForm
            onChanged={async () => {
              enqueueSnackbar('Password updated. Other sessions were signed out.', {
                variant: 'success',
              });
              await queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">Active sessions</Typography>
            <Button
              size="small"
              color="error"
              onClick={async () => {
                await signOut({ allSessions: true });
              }}
            >
              Sign out everywhere
            </Button>
          </Stack>

          {sessions.isLoading && <Typography variant="body2">Loading…</Typography>}

          <List disablePadding>
            {(sessions.data ?? []).map((session) => (
              <ListItem
                key={session.id}
                divider
                secondaryAction={
                  session.current ? (
                    <Chip size="small" color="success" label="This device" />
                  ) : (
                    <Button
                      size="small"
                      color="error"
                      onClick={async () => {
                        await revokeSession.mutateAsync(session.id);
                        await queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
                        enqueueSnackbar('Session signed out', { variant: 'success' });
                      }}
                    >
                      Sign out
                    </Button>
                  )
                }
              >
                <ListItemText
                  primary={session.userAgent ?? 'Unknown device'}
                  secondary={[
                    session.ipAddress ?? 'unknown address',
                    `last seen ${new Date(session.lastSeenAt).toLocaleString()}`,
                    session.rememberMe ? 'kept signed in' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: { maxWidth: { xs: 200, sm: 480 } },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}

function ProfileDetailsForm({
  fullName,
  onSaved,
}: {
  fullName: string;
  onSaved: () => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName },
  });

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<UserDto>('/users/me', input),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
      await onSaved();
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField
          label="Full name"
          fullWidth
          {...register('fullName')}
          error={Boolean(errors.fullName)}
          helperText={errors.fullName?.message}
        />
        <Box>
          <Button type="submit" variant="contained" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

function ChangePasswordForm({ onChanged }: { onChanged: () => Promise<void> }) {
  const changePassword = useChangePasswordMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await changePassword.mutateAsync(values);
      reset({ currentPassword: '', newPassword: '' });
      await onChanged();
    } catch (error) {
      const fieldErrors = extractApiFieldErrors(error);
      if (fieldErrors['currentPassword']?.[0]) {
        setError('currentPassword', { message: fieldErrors['currentPassword'][0] });
        return;
      }
      setFormError(extractApiErrorMessage(error));
    }
  });

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        {formError && <Alert severity="error">{formError}</Alert>}
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          fullWidth
          {...register('currentPassword')}
          error={Boolean(errors.currentPassword)}
          helperText={errors.currentPassword?.message}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          fullWidth
          {...register('newPassword')}
          error={Boolean(errors.newPassword)}
          helperText={errors.newPassword?.message ?? `At least ${PASSWORD_MIN_LENGTH} characters`}
        />
        <Box>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Updating…' : 'Change password'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
