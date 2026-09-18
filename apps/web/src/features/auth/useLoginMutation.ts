import { useMutation } from '@tanstack/react-query';
import type { AuthSession, LoginInput } from '@vendoros/shared';
import { api } from '../../lib/apiClient';

export function useLoginMutation() {
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      return api.post<AuthSession>('/auth/login', input);
    },
  });
}
