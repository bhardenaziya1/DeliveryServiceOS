import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientDto,
  CreateClientInput,
  PaginatedResult,
  PaginationQuery,
  UpdateClientInput,
} from '@vendoros/shared';
import { apiClient } from '../../lib/apiClient';

const CLIENTS_KEY = 'clients';

export function useClients(query: Partial<PaginationQuery>) {
  return useQuery({
    queryKey: [CLIENTS_KEY, query],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResult<ClientDto>>('/clients', {
        params: query,
      });
      return data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: [CLIENTS_KEY, id],
    queryFn: async () => {
      const { data } = await apiClient.get<ClientDto>(`/clients/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateClientInput) => {
      const { data } = await apiClient.post<ClientDto>('/clients', input);
      return data;
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
      const { data } = await apiClient.put<ClientDto>(`/clients/${id}`, input);
      return data;
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
      await apiClient.delete(`/clients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] });
    },
  });
}
