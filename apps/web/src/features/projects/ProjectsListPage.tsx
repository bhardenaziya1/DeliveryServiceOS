import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
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
import { ALL_PROJECT_STATUSES, ProjectDto, ProjectStatus } from '@vendoros/shared';
import { useDeleteProject, useProjects } from './api';
import { useClients } from '../clients/api';
import { ProjectFormDialog } from './ProjectFormDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { EntityAvatar } from '../../components/EntityAvatar';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { extractApiErrorMessage } from '../../lib/apiClient';

const STATUS_COLOR: Record<ProjectStatus, 'success' | 'default' | 'warning' | 'error'> = {
  [ProjectStatus.ACTIVE]: 'success',
  [ProjectStatus.DRAFT]: 'default',
  [ProjectStatus.ON_HOLD]: 'warning',
  [ProjectStatus.CLOSED]: 'error',
};

export function ProjectsListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [clientFilter, setClientFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'ALL'>('ALL');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 20,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectDto | null>(null);

  const { data: clientsPage } = useClients({ page: 1, pageSize: 100 });

  const query = useMemo(
    () => ({
      page: paginationModel.page + 1,
      pageSize: paginationModel.pageSize,
      search: search || undefined,
      clientId: clientFilter === 'ALL' ? undefined : clientFilter,
    }),
    [paginationModel, search, clientFilter],
  );

  const { data, isLoading, isError, error, isFetching, refetch } = useProjects(query);
  const deleteProject = useDeleteProject();

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (statusFilter === 'ALL') return items;
    return items.filter((project) => project.status === statusFilter);
  }, [data, statusFilter]);

  const columns: GridColDef<ProjectDto>[] = [
    {
      field: 'name',
      headerName: 'Project',
      flex: 1.2,
      minWidth: 200,
      renderCell: (params) => (
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ height: '100%' }}>
          <EntityAvatar name={params.value as string} size={28} />
          <Typography variant="body2" fontWeight={600}>
            {params.value}
          </Typography>
        </Stack>
      ),
    },
    { field: 'code', headerName: 'Code', width: 150 },
    { field: 'clientName', headerName: 'Client', flex: 1, minWidth: 180 },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color={STATUS_COLOR[params.value as ProjectStatus]} />
      ),
    },
    {
      field: 'startDate',
      headerName: 'Start date',
      width: 130,
      valueFormatter: (value: string) => new Date(value).toLocaleDateString('en-AE'),
    },
    {
      field: 'endDate',
      headerName: 'End date',
      width: 130,
      valueFormatter: (value: string | null) => (value ? new Date(value).toLocaleDateString('en-AE') : '—'),
    },
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
                setEditingProject(params.row);
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
      await deleteProject.mutateAsync(pendingDelete.id);
      enqueueSnackbar('Project deleted', { variant: 'success' });
      setPendingDelete(null);
    } catch (err) {
      enqueueSnackbar(extractApiErrorMessage(err), { variant: 'error' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Projects"
        subtitle="Engagements under each client, each with its own contract and rate rules."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingProject(null);
              setFormOpen(true);
            }}
          >
            New project
          </Button>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search by name or code…"
          size="small"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ minWidth: 280 }}
        />
        <TextField
          select
          size="small"
          label="Client"
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="ALL">All clients</MenuItem>
          {(clientsPage?.items ?? []).map((client) => (
            <MenuItem key={client.id} value={client.id}>
              {client.legalName}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | 'ALL')}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">All statuses</MenuItem>
          {ALL_PROJECT_STATUSES.map((status) => (
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

      <Card sx={{ height: 560, overflow: 'hidden' }}>
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
                  No projects yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create a project under a client to start defining its contract and rates.
                </Typography>
              </Stack>
            ),
          }}
        />
      </Card>

      <ProjectFormDialog open={formOpen} onClose={() => setFormOpen(false)} project={editingProject} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete project"
        description={`Delete "${pendingDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteProject.isPending}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Box>
  );
}
