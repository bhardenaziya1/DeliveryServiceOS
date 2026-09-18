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
  ALL_CLIENT_STATUSES,
  ClientDto,
  ClientStatus,
  createClientSchema,
  type CreateClientInput,
} from '@vendoros/shared';
import { useCreateClient, useUpdateClient } from './api';
import { extractApiErrorMessage } from '../../lib/apiClient';

interface ClientFormDialogProps {
  open: boolean;
  onClose: () => void;
  client?: ClientDto | null;
}

const emptyDefaults: CreateClientInput = {
  legalName: '',
  tradeName: '',
  tradeLicenseNumber: '',
  taxRegistrationNumber: '',
  status: ClientStatus.ONBOARDING,
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  billingAddress: '',
  notes: '',
};

export function ClientFormDialog({ open, onClose, client }: ClientFormDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = Boolean(client);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: emptyDefaults,
  });

  useEffect(() => {
    if (open) {
      reset(
        client
          ? {
              legalName: client.legalName,
              tradeName: client.tradeName ?? '',
              tradeLicenseNumber: client.tradeLicenseNumber ?? '',
              taxRegistrationNumber: client.taxRegistrationNumber ?? '',
              status: client.status,
              primaryContactName: client.primaryContactName,
              primaryContactEmail: client.primaryContactEmail,
              primaryContactPhone: client.primaryContactPhone,
              billingAddress: client.billingAddress ?? '',
              notes: client.notes ?? '',
            }
          : emptyDefaults,
      );
    }
  }, [open, client, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && client) {
        await updateClient.mutateAsync({ id: client.id, input: values });
        enqueueSnackbar('Client updated', { variant: 'success' });
      } else {
        await createClient.mutateAsync(values);
        enqueueSnackbar('Client created', { variant: 'success' });
      }
      onClose();
    } catch (error) {
      enqueueSnackbar(extractApiErrorMessage(error), { variant: 'error' });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit client' : 'New client'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={8}>
            <TextField
              label="Legal name"
              fullWidth
              required
              {...register('legalName')}
              error={Boolean(errors.legalName)}
              helperText={errors.legalName?.message}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="Trade name" fullWidth {...register('tradeName')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label="Trade license number" fullWidth {...register('tradeLicenseNumber')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label="TRN (Tax Registration Number)" fullWidth {...register('taxRegistrationNumber')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Status"
              select
              fullWidth
              defaultValue={client?.status ?? ClientStatus.ONBOARDING}
              {...register('status')}
            >
              {ALL_CLIENT_STATUSES.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField
              label="Primary contact name"
              fullWidth
              required
              {...register('primaryContactName')}
              error={Boolean(errors.primaryContactName)}
              helperText={errors.primaryContactName?.message}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Primary contact email"
              fullWidth
              required
              {...register('primaryContactEmail')}
              error={Boolean(errors.primaryContactEmail)}
              helperText={errors.primaryContactEmail?.message}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Primary contact phone"
              placeholder="+9715XXXXXXXX"
              fullWidth
              required
              {...register('primaryContactPhone')}
              error={Boolean(errors.primaryContactPhone)}
              helperText={errors.primaryContactPhone?.message}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Billing address" fullWidth multiline minRows={2} {...register('billingAddress')} />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Notes" fullWidth multiline minRows={2} {...register('notes')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSubmit} variant="contained" disabled={isSubmitting}>
          {isEdit ? 'Save changes' : 'Create client'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
