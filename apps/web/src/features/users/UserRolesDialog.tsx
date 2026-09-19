import { useState } from 'react';
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
  Typography,
} from '@mui/material';
import { canManageRole, SYSTEM_ROLES, type RoleKey, type UserDto } from '@vendoros/shared';
import { useAuth } from '../auth/AuthContext';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAssignRolesMutation } from './api';

/**
 * Edits a user's role set.
 *
 * Roles the current user is not allowed to grant are shown but disabled, using
 * the same `canManageRole` rule the API enforces - so the UI explains the
 * limit rather than offering an action that would come back 403.
 */
export function UserRolesDialog({
  user,
  open,
  onClose,
  onSaved,
}: {
  user: UserDto;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { user: actor } = useAuth();
  const assignRoles = useAssignRolesMutation();
  const [selected, setSelected] = useState<RoleKey[]>(user.roles);
  const [error, setError] = useState<string | null>(null);

  const actorRoles = actor?.roles ?? [];
  const isSelf = actor?.id === user.id;

  const toggle = (role: RoleKey) => {
    setSelected((current) =>
      current.includes(role) ? current.filter((key) => key !== role) : [...current, role],
    );
  };

  const save = async () => {
    setError(null);
    try {
      await assignRoles.mutateAsync({ userId: user.id, roleKeys: selected });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(extractApiErrorMessage(caught));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Roles for {user.fullName}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1}>
          {error && <Alert severity="error">{error}</Alert>}
          {isSelf && (
            <Alert severity="info">
              You cannot change your own roles. Ask another administrator.
            </Alert>
          )}

          {SYSTEM_ROLES.map((role) => {
            const allowed = !isSelf && canManageRole(actorRoles, role.key);
            return (
              <FormControlLabel
                key={role.key}
                disabled={!allowed}
                control={
                  <Checkbox
                    checked={selected.includes(role.key)}
                    onChange={() => toggle(role.key)}
                  />
                }
                label={
                  <span>
                    <Typography component="span" fontWeight={600}>
                      {role.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {allowed
                        ? role.description
                        : `${role.description} (you cannot grant this role)`}
                    </Typography>
                  </span>
                }
                sx={{ alignItems: 'flex-start', mr: 0 }}
              />
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={isSelf || selected.length === 0 || assignRoles.isPending}
        >
          Save roles
        </Button>
      </DialogActions>
    </Dialog>
  );
}
