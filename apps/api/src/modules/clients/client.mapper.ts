import { Client } from '@prisma/client';
import { ClientDto } from '@vendoros/shared';

type ClientWithProjectCount = Client & { _count?: { projects: number } };

export function toClientDto(client: ClientWithProjectCount): ClientDto {
  return {
    id: client.id,
    tenantId: client.tenantId,
    legalName: client.legalName,
    tradeName: client.tradeName,
    tradeLicenseNumber: client.tradeLicenseNumber,
    taxRegistrationNumber: client.taxRegistrationNumber,
    status: client.status,
    primaryContactName: client.primaryContactName,
    primaryContactEmail: client.primaryContactEmail,
    primaryContactPhone: client.primaryContactPhone,
    billingAddress: client.billingAddress,
    notes: client.notes,
    projectCount: client._count?.projects ?? 0,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}
