import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useSnackbar } from 'notistack';
import { getSystemRole, isRoleKey, PERMISSIONS, UserStatus, type UserDto } from '@vendoros/shared';
import { PageHeader } from '../../components/PageHeader';
import { Can } from '../../routes/RequirePermission';
import { useAuth } from '../auth/AuthContext';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { extractApiErrorMessage } from '../../lib/apiClient';
import {
  INVITATIONS_QUERY_KEY,
  USERS_QUERY_KEY,
  useInvitationsQuery,
  useRevokeInvitationMutation,
  useUpdateUserMutation,
  useUsersQuery,
} from './api';
import { InviteUserDialog } from './InviteUserDialog';
import { UserRolesDialog } from './UserRolesDialog';

const STATUS_COLOR: Record<UserStatus, 'success' | 'default' | 'warning'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DISABLED: 'default',
};

/**
 * Team administration.
 *
 * Every action here is gated by the same permission the API requires, so the
 * page shows a user only the controls their role can actually use.
 */
export function UsersListPage() {
  const { user: actor, hasPermission } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRolesFor, setEditingRolesFor] = useState<UserDto | null>(null);

  const users = useUsersQuery({ search: debouncedSearch || undefined, pageSize: 50 });
  const invitations = useInvitationsQuery(hasPermission(PERMISSIONS.USERS_INVITE));
  const updateUser = useUpdateUserMutation();
  const revokeInvitation = useRevokeInvitationMutation();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
  };

  // INVITED is not a settable state: it is what a user *is* until they accept,
  // so the API's update schema only accepts these two.
  const setStatus = async (user: UserDto, status: 'ACTIVE' | 'DISABLED') => {
    try {
      await updateUser.mutateAsync({ userId: user.id, status });
      await refresh();
      enqueueSnackbar(
        status === UserStatus.DISABLED ? 'User disabled and signed out' : 'User re-enabled',
        { variant: 'success' },
      );
    } catch (error) {
      enqueueSnackbar(extractApiErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Team"
        subtitle="Who can sign in, and what they are allowed to do"
        action={
          <Can anyOf={[PERMISSIONS.USERS_INVITE]}>
            <Button
              variant="contained"
              startIcon={<PersonAddAltOutlinedIcon />}
              onClick={() => setInviteOpen(true)}
            >
              Invite user
            </Button>
          </Can>
        }
      />

      <TextField
        size="small"
        placeholder="Search by name or email…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ mb: 2, width: { xs: '100%', sm: 320 } }}
      />

      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Roles</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last sign-in</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(users.data?.items ?? []).map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {user.fullName}
                    {user.id === actor?.id && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        (you)
                      </Typography>
                    )}
                  </Typography>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {user.roles.map((role) => (
                      <Chip
                        key={role}
                        size="small"
                        variant="outlined"
                        label={isRoleKey(role) ? getSystemRole(role).name : role}
                      />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip size="small" color={STATUS_COLOR[user.status]} label={user.status} />
                </TableCell>
                <TableCell>
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell align="right">
                  <Can anyOf={[PERMISSIONS.ROLES_ASSIGN]}>
                    <Tooltip title="Edit roles">
                      <span>
                        <IconButton
                          size="small"
                          disabled={user.id === actor?.id}
                          onClick={() => setEditingRolesFor(user)}
                        >
                          <ManageAccountsOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Can>
                  <Can anyOf={[PERMISSIONS.USERS_DEACTIVATE, PERMISSIONS.USERS_UPDATE]}>
                    {user.status === UserStatus.DISABLED ? (
                      <Tooltip title="Re-enable">
                        <IconButton size="small" onClick={() => setStatus(user, UserStatus.ACTIVE)}>
                          <CheckCircleOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Disable">
                        <span>
                          <IconButton
                            size="small"
                            disabled={user.id === actor?.id}
                            onClick={() => setStatus(user, UserStatus.DISABLED)}
                          >
                            <BlockOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Can>
                </TableCell>
              </TableRow>
            ))}

            {users.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                    No users match that search.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Can anyOf={[PERMISSIONS.USERS_INVITE]}>
        {(invitations.data ?? []).length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Pending invitations
            </Typography>
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Roles</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(invitations.data ?? []).map((invitation) => (
                    <TableRow key={invitation.id} hover>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {invitation.roles.map((role) => (
                            <Chip
                              key={role}
                              size="small"
                              variant="outlined"
                              label={isRoleKey(role) ? getSystemRole(role).name : role}
                            />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>{new Date(invitation.expiresAt).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Withdraw invitation">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              await revokeInvitation.mutateAsync(invitation.id);
                              await refresh();
                              enqueueSnackbar('Invitation withdrawn', { variant: 'success' });
                            }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Box>
        )}
      </Can>

      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={refresh}
      />

      {editingRolesFor && (
        <UserRolesDialog
          user={editingRolesFor}
          open
          onClose={() => setEditingRolesFor(null)}
          onSaved={refresh}
        />
      )}
    </Box>
  );
}
