import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProjectInput,
  PaginatedResult,
  PaginationQuery,
  ProjectDto,
  UpdateProjectInput,
} from '@vendoros/shared';
import { apiClient } from '../../lib/apiClient';

const PROJECTS_KEY = 'projects';

export function useProjects(query: Partial<PaginationQuery> & { clientId?: string }) {
  return useQuery({
    queryKey: [PROJECTS_KEY, query],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResult<ProjectDto>>('/projects', {
        params: query,
      });
      return data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const { data } = await apiClient.post<ProjectDto>('/projects', input);
      return data;
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
      const { data } = await apiClient.put<ProjectDto>(`/projects/${id}`, input);
      return data;
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
      await apiClient.delete(`/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROJECTS_KEY] });
    },
  });
}
