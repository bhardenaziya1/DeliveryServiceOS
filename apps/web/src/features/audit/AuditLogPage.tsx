import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  ALL_AUDIT_ACTIONS,
  type AuditAction,
  type AuditLogDto,
  type PaginatedResult,
} from '@vendoros/shared';
import { api } from '../../lib/apiClient';
import { PageHeader } from '../../components/PageHeader';

/** Security-relevant actions are called out so they stand apart from CRUD noise. */
const ACTION_COLOR: Partial<Record<AuditAction, 'error' | 'warning' | 'success' | 'info'>> = {
  LOGIN: 'success',
  LOGIN_FAILED: 'warning',
  LOGOUT: 'info',
  TOKEN_REUSE_DETECTED: 'error',
  SESSION_REVOKED: 'warning',
  PASSWORD_CHANGED: 'warning',
  PASSWORD_RESET_REQUESTED: 'warning',
  PASSWORD_RESET_COMPLETED: 'warning',
  ROLES_CHANGED: 'error',
  USER_DISABLED: 'error',
  USER_INVITED: 'info',
  TENANT_CREATED: 'info',
};

export function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [action, setAction] = useState<AuditAction | ''>('');

  const query = useQuery({
    queryKey: ['audit-logs', page, pageSize, action],
    queryFn: () =>
      api.get<PaginatedResult<AuditLogDto>>('/audit-logs', {
        params: {
          page: page + 1,
          pageSize,
          ...(action ? { action } : {}),
        },
      }),
  });

  return (
    <Box>
      <PageHeader
        title="Audit log"
        subtitle="Every sign-in, permission change and record change in your tenant"
      />

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value as AuditAction | '');
            setPage(0);
          }}
          sx={{ width: 260 }}
        >
          <MenuItem value="">All actions</MenuItem>
          {ALL_AUDIT_ACTIONS.map((value) => (
            <MenuItem key={value} value={value}>
              {value.replace(/_/g, ' ').toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Actor</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>Source</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(query.data?.items ?? []).map((entry) => (
              <TableRow key={entry.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={ACTION_COLOR[entry.action] ?? 'default'}
                    variant={ACTION_COLOR[entry.action] ? 'filled' : 'outlined'}
                    label={entry.action.replace(/_/g, ' ').toLowerCase()}
                  />
                </TableCell>
                <TableCell>{entry.actorEmail ?? '—'}</TableCell>
                <TableCell>
                  <Typography variant="body2">{entry.entityType}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.entityId}
                  </Typography>
                </TableCell>
                <TableCell>{entry.ipAddress ?? '—'}</TableCell>
              </TableRow>
            ))}

            {query.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                    No audit entries match that filter.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={query.data?.total ?? 0}
          page={page}
          onPageChange={(_event, next) => setPage(next)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Card>
    </Box>
  );
}
