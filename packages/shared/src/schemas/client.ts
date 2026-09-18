import { z } from 'zod';
import { ClientStatus } from '../types/enums';

export const clientStatusEnum = z.nativeEnum(ClientStatus);

const uaePhoneRegex = /^\+971[0-9]{8,9}$/;

export const createClientSchema = z.object({
  legalName: z.string().trim().min(2, 'Legal name is required').max(200),
  tradeName: z.string().trim().max(200).optional().or(z.literal('')),
  tradeLicenseNumber: z.string().trim().max(100).optional().or(z.literal('')),
  taxRegistrationNumber: z.string().trim().max(50).optional().or(z.literal('')),
  status: clientStatusEnum.default(ClientStatus.ONBOARDING),
  primaryContactName: z.string().trim().min(2, 'Contact name is required').max(150),
  primaryContactEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  primaryContactPhone: z
    .string()
    .trim()
    .regex(uaePhoneRegex, 'Phone must be in +971XXXXXXXXX format'),
  billingAddress: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export interface ClientDto {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName: string | null;
  tradeLicenseNumber: string | null;
  taxRegistrationNumber: string | null;
  status: ClientStatus;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  billingAddress: string | null;
  notes: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}
