import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AssignRolesInput,
  InvitationDto,
  InviteUserInput,
  PaginatedResult,
  PaginationQuery,
  UpdateUserInput,
  UserDto,
} from '@vendoros/shared';
import { api } from '../../lib/apiClient';

export const USERS_QUERY_KEY = ['users'] as const;
export const INVITATIONS_QUERY_KEY = ['users', 'invitations'] as const;

export function useUsersQuery(query: Partial<PaginationQuery>, enabled = true) {
  return useQuery({
    queryKey: [...USERS_QUERY_KEY, query],
    enabled,
    queryFn: () => api.get<PaginatedResult<UserDto>>('/users', { params: query }),
  });
}

export function useInvitationsQuery(enabled = true) {
  return useQuery({
    queryKey: INVITATIONS_QUERY_KEY,
    enabled,
    queryFn: () => api.get<InvitationDto[]>('/users/invitations'),
  });
}

export function useInviteUserMutation() {
  return useMutation({
    mutationFn: (input: InviteUserInput) => api.post<InvitationDto>('/users/invitations', input),
  });
}

export function useRevokeInvitationMutation() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/invitations/${id}`),
  });
}

export function useAssignRolesMutation() {
  return useMutation({
    mutationFn: ({ userId, ...input }: AssignRolesInput & { userId: string }) =>
      api.put<UserDto>(`/users/${userId}/roles`, input),
  });
}

export function useUpdateUserMutation() {
  return useMutation({
    mutationFn: ({ userId, ...input }: UpdateUserInput & { userId: string }) =>
      api.put<UserDto>(`/users/${userId}`, input),
  });
}
