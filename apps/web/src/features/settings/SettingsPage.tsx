import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  SYSTEM_ROLES,
  updateTenantSchema,
  type TenantDto,
  type UpdateTenantInput,
} from '@vendoros/shared';
import { api, extractApiErrorMessage } from '../../lib/apiClient';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../auth/AuthContext';

export function SettingsPage() {
  const { refreshCurrentUser } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const tenantQuery = useQuery({
    queryKey: ['tenant'],
    queryFn: () => api.get<TenantDto>('/tenant'),
  });

  const updateTenant = useMutation({
    mutationFn: (input: UpdateTenantInput) => api.patch<TenantDto>('/tenant', input),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTenantInput>({
    resolver: zodResolver(updateTenantSchema),
    values: { name: tenantQuery.data?.name ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updateTenant.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
      await refreshCurrentUser();
      enqueueSnackbar('Company details updated', { variant: 'success' });
    } catch (error) {
      setFormError(extractApiErrorMessage(error));
    }
  });

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Company details and the role catalogue" />

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Company
            </Typography>
            <Box component="form" onSubmit={onSubmit} noValidate>
              <Stack spacing={2} sx={{ maxWidth: 480 }}>
                {formError && <Alert severity="error">{formError}</Alert>}
                <TextField
                  label="Company name"
                  fullWidth
                  {...register('name')}
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                />
                <TextField
                  label="Workspace"
                  fullWidth
                  disabled
                  value={tenantQuery.data?.slug ?? ''}
                  helperText="Allocated at sign-up and cannot be changed"
                />
                <Box>
                  <Button type="submit" variant="contained" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : 'Save changes'}
                  </Button>
                </Box>
              </Stack>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Roles
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These roles and their permissions are the same set the API enforces. Assign them to
              people from the Team page.
            </Typography>

            <Stack spacing={2}>
              {SYSTEM_ROLES.map((role) => (
                <Box key={role.key}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2">{role.name}</Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${role.permissions.length} permissions`}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {role.description}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
