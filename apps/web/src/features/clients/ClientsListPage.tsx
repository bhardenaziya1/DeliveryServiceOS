import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSnackbar } from 'notistack';
import { ALL_CLIENT_STATUSES, ClientDto, ClientStatus } from '@vendoros/shared';
import { useClients, useDeleteClient } from './api';
import { ClientFormDialog } from './ClientFormDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { extractApiErrorMessage } from '../../lib/apiClient';

const STATUS_COLOR: Record<ClientStatus, 'success' | 'default' | 'warning' | 'error'> = {
  [ClientStatus.ACTIVE]: 'success',
  [ClientStatus.ONBOARDING]: 'warning',
  [ClientStatus.INACTIVE]: 'default',
  [ClientStatus.OFFBOARDED]: 'error',
};

export function ClientsListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'ALL'>('ALL');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 20,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClientDto | null>(null);

  const query = useMemo(
    () => ({
      page: paginationModel.page + 1,
      pageSize: paginationModel.pageSize,
      search: search || undefined,
    }),
    [paginationModel, search],
  );

  const { data, isLoading, isError, error, isFetching, refetch } = useClients(query);
  const deleteClient = useDeleteClient();

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (statusFilter === 'ALL') return items;
    return items.filter((client) => client.status === statusFilter);
  }, [data, statusFilter]);

  const columns: GridColDef<ClientDto>[] = [
    { field: 'legalName', headerName: 'Legal name', flex: 1.2, minWidth: 200 },
    { field: 'tradeName', headerName: 'Trade name', flex: 1, minWidth: 150, valueGetter: (_v, row) => row.tradeName ?? '—' },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color={STATUS_COLOR[params.value as ClientStatus]} />
      ),
    },
    { field: 'primaryContactName', headerName: 'Contact', flex: 1, minWidth: 160 },
    { field: 'primaryContactEmail', headerName: 'Email', flex: 1, minWidth: 200 },
    { field: 'primaryContactPhone', headerName: 'Phone', width: 150 },
    { field: 'projectCount', headerName: 'Projects', width: 100, type: 'number' },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={() => {
                setEditingClient(params.row);
                setFormOpen(true);
              }}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => setPendingDelete(params.row)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteClient.mutateAsync(pendingDelete.id);
      enqueueSnackbar('Client deleted', { variant: 'success' });
      setPendingDelete(null);
    } catch (err) {
      enqueueSnackbar(extractApiErrorMessage(err), { variant: 'error' });
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Clients
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Delivery and logistics companies your fleet and workforce supply.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingClient(null);
            setFormOpen(true);
          }}
        >
          New client
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search by name or email…"
          size="small"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ minWidth: 280 }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ClientStatus | 'ALL')}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">All statuses</MenuItem>
          {ALL_CLIENT_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {status}
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {extractApiErrorMessage(error)}
        </Alert>
      )}

      <Box sx={{ height: 560, bgcolor: 'background.paper', borderRadius: 1 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading || isFetching}
          paginationMode="server"
          rowCount={data?.total ?? 0}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 20, 50]}
          disableRowSelectionOnClick
          density="comfortable"
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': { borderBottom: '1px solid', borderColor: 'divider' },
            '& .MuiDataGrid-row:hover': { bgcolor: 'action.hover' },
          }}
          slots={{
            noRowsOverlay: () => (
              <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', p: 4 }}>
                <Typography variant="body1" fontWeight={600}>
                  No clients yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create your first client to start attaching projects and contracts.
                </Typography>
              </Stack>
            ),
          }}
        />
      </Box>

      <ClientFormDialog open={formOpen} onClose={() => setFormOpen(false)} client={editingClient} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete client"
        description={`Delete "${pendingDelete?.legalName}"? This cannot be undone. Clients with existing projects cannot be deleted.`}
        confirmLabel="Delete"
        loading={deleteClient.isPending}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Box>
  );
}
