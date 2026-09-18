import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientDto,
  CreateClientInput,
  PaginatedResult,
  PaginationQuery,
  UpdateClientInput,
} from '@vendoros/shared';
import { api } from '../../lib/apiClient';

const CLIENTS_KEY = 'clients';

export function useClients(query: Partial<PaginationQuery>) {
  return useQuery({
    queryKey: [CLIENTS_KEY, query],
    queryFn: async () => {
      return api.get<PaginatedResult<ClientDto>>('/clients', {
        params: query,
      });
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: [CLIENTS_KEY, id],
    queryFn: async () => {
      return api.get<ClientDto>(`/clients/${id}`);
    },
    enabled: Boolean(id),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateClientInput) => {
      return api.post<ClientDto>('/clients', input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateClientInput }) => {
      return api.put<ClientDto>(`/clients/${id}`, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}
