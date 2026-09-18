import { UserRole } from '@prisma/client';

// Everything a request needs to know about the caller, derived exclusively
// from the verified JWT - never from client-supplied body/query params.
export interface RequestUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: UserRole;
}
