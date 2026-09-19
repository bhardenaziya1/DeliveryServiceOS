import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AcceptInvitationInput,
  AuthSession,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  SessionDto,
} from '@vendoros/shared';
import { api } from '../../lib/apiClient';

/** What the acceptance screen can show before the invitee has credentials. */
export interface InvitationPreview {
  email: string;
  fullName: string;
  tenantName: string;
  roles: string[];
  expiresAt: string;
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthSession>('/auth/login', input),
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<AuthSession>('/auth/register', input),
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      api.post<{ status: string }>('/auth/forgot-password', input),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      api.post<{ status: string }>('/auth/reset-password', input),
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api.patch<{ status: string }>('/auth/password', input),
  });
}

export function useVerifyEmailMutation() {
  return useMutation({
    mutationFn: (token: string) => api.post<{ status: string }>('/auth/verify-email', { token }),
  });
}

export function useResendVerificationMutation() {
  return useMutation({
    mutationFn: () => api.post<{ status: string }>('/auth/resend-verification'),
  });
}

export function useInvitationPreviewQuery(token: string | null) {
  return useQuery({
    queryKey: ['invitation', token],
    enabled: Boolean(token),
    // An invitation link is followed once; refetching it adds nothing.
    retry: false,
    queryFn: () => api.get<InvitationPreview>(`/invitations/${encodeURIComponent(token ?? '')}`),
  });
}

export function useAcceptInvitationMutation() {
  return useMutation({
    mutationFn: (input: AcceptInvitationInput) =>
      api.post<AuthSession>('/invitations/accept', input),
  });
}

export const SESSIONS_QUERY_KEY = ['auth', 'sessions'] as const;

export function useSessionsQuery(enabled = true) {
  return useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    enabled,
    queryFn: () => api.get<SessionDto[]>('/auth/sessions'),
  });
}

export function useRevokeSessionMutation() {
  return useMutation({
    mutationFn: (sessionId: string) => api.delete(`/auth/sessions/${sessionId}`),
  });
}
