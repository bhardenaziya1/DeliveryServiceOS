import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  canManageRole,
  inviteUserSchema,
  SYSTEM_ROLES,
  type InviteUserInput,
  type RoleKey,
} from '@vendoros/shared';
import { useAuth } from '../auth/AuthContext';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useInviteUserMutation } from './api';

export function InviteUserDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => Promise<void> | void;
}) {
  const { user: actor } = useAuth();
  const inviteUser = useInviteUserMutation();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: '', fullName: '', roleKeys: [] },
  });

  // Only roles the inviter may actually grant; the API rejects the rest anyway.
  const grantableRoles = SYSTEM_ROLES.filter((role) => canManageRole(actor?.roles ?? [], role.key));

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await inviteUser.mutateAsync(values);
      reset();
      await onInvited();
      onClose();
    } catch (caught) {
      setError(extractApiErrorMessage(caught));
    }
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Work email"
              type="email"
              fullWidth
              autoFocus
              {...register('email')}
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
            />

            <TextField
              label="Full name"
              fullWidth
              {...register('fullName')}
              error={Boolean(errors.fullName)}
              helperText={errors.fullName?.message}
            />

            <div>
              <Typography variant="subtitle2" gutterBottom>
                Roles
              </Typography>
              {errors.roleKeys && (
                <Typography variant="caption" color="error" display="block" gutterBottom>
                  {errors.roleKeys.message}
                </Typography>
              )}

              <Controller
                control={control}
                name="roleKeys"
                render={({ field }) => (
                  <Stack>
                    {grantableRoles.map((role) => (
                      <FormControlLabel
                        key={role.key}
                        control={
                          <Checkbox
                            checked={field.value.includes(role.key)}
                            onChange={() => {
                              const next: RoleKey[] = field.value.includes(role.key)
                                ? field.value.filter((key) => key !== role.key)
                                : [...field.value, role.key];
                              field.onChange(next);
                            }}
                          />
                        }
                        label={
                          <span>
                            <Typography component="span" fontWeight={600}>
                              {role.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {role.description}
                            </Typography>
                          </span>
                        }
                        sx={{ alignItems: 'flex-start', mr: 0 }}
                      />
                    ))}
                  </Stack>
                )}
              />
            </div>

            <Typography variant="caption" color="text.secondary">
              They will receive an email with a link to set their own password. The account is
              created only once they accept.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
