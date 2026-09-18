import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProjectInput,
  PaginatedResult,
  PaginationQuery,
  ProjectDto,
  UpdateProjectInput,
} from '@vendoros/shared';
import { api } from '../../lib/apiClient';

const PROJECTS_KEY = 'projects';

export function useProjects(query: Partial<PaginationQuery> & { clientId?: string }) {
  return useQuery({
    queryKey: [PROJECTS_KEY, query],
    queryFn: async () => {
      return api.get<PaginatedResult<ProjectDto>>('/projects', {
        params: query,
      });
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      return api.post<ProjectDto>('/projects', input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROJECTS_KEY] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProjectInput }) => {
      return api.put<ProjectDto>(`/projects/${id}`, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROJECTS_KEY] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROJECTS_KEY] });
    },
  });
}
