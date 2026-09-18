import { describe, expect, it } from 'vitest';
import { createClientSchema } from './client';
import { ClientStatus } from '../types/enums';

const validClient = {
  legalName: 'Swift Logistics FZ-LLC',
  status: ClientStatus.ACTIVE,
  primaryContactName: 'Ahmed Al Mazrouei',
  primaryContactEmail: 'ops@swiftlogistics.ae',
  primaryContactPhone: '+971501234567',
};

describe('createClientSchema', () => {
  it('accepts a valid client payload', () => {
    const result = createClientSchema.safeParse(validClient);
    expect(result.success).toBe(true);
  });

  it('rejects a phone number without the UAE country code', () => {
    const result = createClientSchema.safeParse({ ...validClient, primaryContactPhone: '0501234567' });
    expect(result.success).toBe(false);
  });

  it('rejects a phone number with the wrong country code', () => {
    const result = createClientSchema.safeParse({ ...validClient, primaryContactPhone: '+447911123456' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid contact email', () => {
    const result = createClientSchema.safeParse({ ...validClient, primaryContactEmail: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects a legal name shorter than 2 characters', () => {
    const result = createClientSchema.safeParse({ ...validClient, legalName: 'A' });
    expect(result.success).toBe(false);
  });

  it('defaults status to ONBOARDING when omitted', () => {
    const { status: _status, ...withoutStatus } = validClient;
    const result = createClientSchema.parse(withoutStatus);
    expect(result.status).toBe(ClientStatus.ONBOARDING);
  });
});
