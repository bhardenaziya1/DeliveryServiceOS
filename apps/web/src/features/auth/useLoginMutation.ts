import { useMutation } from '@tanstack/react-query';
import type { AuthSession, LoginInput } from '@vendoros/shared';
import { apiClient } from '../../lib/apiClient';

export function useLoginMutation() {
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data } = await apiClient.post<AuthSession>('/auth/login', input);
      return data;
    },
  });
}
