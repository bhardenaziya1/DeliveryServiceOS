import { describe, expect, it } from 'vitest';
import { loginSchema } from './auth';

describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'owner@demo-vendor.ae',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('lowercases and trims the email', () => {
    const result = loginSchema.parse({
      email: '  Owner@Demo-Vendor.AE  ',
      password: 'Password123!',
    });
    expect(result.email).toBe('owner@demo-vendor.ae');
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = loginSchema.safeParse({ email: 'owner@demo-vendor.ae', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'Password123!' });
    expect(result.success).toBe(false);
  });
});
