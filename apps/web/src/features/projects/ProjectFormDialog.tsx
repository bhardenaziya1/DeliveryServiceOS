import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  ALL_PROJECT_STATUSES,
  createProjectSchema,
  ProjectDto,
  ProjectStatus,
  type CreateProjectInput,
} from '@vendoros/shared';
import { useCreateProject, useUpdateProject } from './api';
import { useClients } from '../clients/api';
import { extractApiErrorMessage } from '../../lib/apiClient';

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  project?: ProjectDto | null;
  defaultClientId?: string;
}

function buildDefaults(defaultClientId?: string): CreateProjectInput {
  return {
    clientId: defaultClientId ?? '',
    name: '',
    code: '',
    status: ProjectStatus.DRAFT,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    description: '',
  };
}

export function ProjectFormDialog({ open, onClose, project, defaultClientId }: ProjectFormDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const { data: clientsPage } = useClients({ page: 1, pageSize: 100 });
  const isEdit = Boolean(project);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: buildDefaults(defaultClientId),
  });

  useEffect(() => {
    if (open) {
      reset(
        project
          ? {
              clientId: project.clientId,
              name: project.name,
              code: project.code,
              status: project.status,
              startDate: project.startDate.slice(0, 10),
              endDate: project.endDate ? project.endDate.slice(0, 10) : '',
              description: project.description ?? '',
            }
          : buildDefaults(defaultClientId),
      );
    }
  }, [open, project, defaultClientId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && project) {
        const { clientId: _clientId, ...updateValues } = values;
        await updateProject.mutateAsync({ id: project.id, input: updateValues });
        enqueueSnackbar('Project updated', { variant: 'success' });
      } else {
        await createProject.mutateAsync(values);
        enqueueSnackbar('Project created', { variant: 'success' });
      }
      onClose();
    } catch (error) {
      enqueueSnackbar(extractApiErrorMessage(error), { variant: 'error' });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={8}>
            <TextField
              label="Client"
              select
              fullWidth
              required
              disabled={isEdit}
              defaultValue={project?.clientId ?? defaultClientId ?? ''}
              {...register('clientId')}
              error={Boolean(errors.clientId)}
              helperText={errors.clientId?.message}
            >
              {(clientsPage?.items ?? []).map((client) => (
                <MenuItem key={client.id} value={client.id}>
                  {client.legalName}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Status"
              select
              fullWidth
              defaultValue={project?.status ?? ProjectStatus.DRAFT}
              {...register('status')}
            >
              {ALL_PROJECT_STATUSES.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField
              label="Project name"
              fullWidth
              required
              {...register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Project code"
              fullWidth
              required
              placeholder="CLIENT-CITY-01"
              {...register('code')}
              error={Boolean(errors.code)}
              helperText={errors.code?.message}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Start date"
              type="date"
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              {...register('startDate')}
              error={Boolean(errors.startDate)}
              helperText={errors.startDate?.message}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="End date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              {...register('endDate')}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Description" fullWidth multiline minRows={2} {...register('description')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSubmit} variant="contained" disabled={isSubmitting}>
          {isEdit ? 'Save changes' : 'Create project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
