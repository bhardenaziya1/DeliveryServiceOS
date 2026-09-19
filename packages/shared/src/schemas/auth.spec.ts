import { describe, expect, it } from 'vitest';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  inviteUserSchema,
  loginSchema,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth';
import { ROLES } from '../rbac/roles';

describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'owner@demo-vendor.ae',
      password: 'DemoPassword123!',
    });
    expect(result.success).toBe(true);
  });

  it('lowercases and trims the email', () => {
    const result = loginSchema.parse({
      email: '  Owner@Demo-Vendor.AE  ',
      password: 'DemoPassword123!',
    });
    expect(result.email).toBe('owner@demo-vendor.ae');
  });

  it('accepts a short password that predates the current policy', () => {
    // Login must not apply the new-password rules: an account created before
    // the policy tightened still has to be able to sign in (and be told to
    // rotate). Only an *empty* password is a client-side error.
    const result = loginSchema.safeParse({ email: 'owner@demo-vendor.ae', password: 'short' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'owner@demo-vendor.ae', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'DemoPassword123!' });
    expect(result.success).toBe(false);
  });

  it('defaults rememberMe to off', () => {
    const result = loginSchema.parse({
      email: 'owner@demo-vendor.ae',
      password: 'DemoPassword123!',
    });
    expect(result.rememberMe).toBe(false);
  });

  it('drops unknown keys, so a client-supplied tenantId never survives parsing', () => {
    const result = loginSchema.parse({
      email: 'owner@demo-vendor.ae',
      password: 'DemoPassword123!',
      tenantId: 'someone-elses-tenant',
    });
    expect(result).not.toHaveProperty('tenantId');
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('CorrectHorse1Battery').success).toBe(true);
  });

  it.each([
    ['too short', 'Short1aa'],
    ['no uppercase', 'alllowercase123'],
    ['no lowercase', 'ALLUPPERCASE123'],
    ['no digit', 'NoDigitsInHereAtAll'],
  ])('rejects one that is %s', (_label, password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });

  it(`requires at least ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(passwordSchema.safeParse('Abcdefgh123').success).toBe(false);
    expect(passwordSchema.safeParse('Abcdefgh1234').success).toBe(true);
  });

  it('caps the length, so hashing cannot be used to burn CPU', () => {
    expect(passwordSchema.safeParse(`Aa1${'x'.repeat(200)}`).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    tenantName: 'New Co Manpower LLC',
    fullName: 'Founder One',
    email: 'founder@newco.ae',
    password: 'FounderPassword1',
  };

  it('accepts a complete sign-up', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('makes the slug optional', () => {
    expect(registerSchema.parse(valid).tenantSlug).toBeUndefined();
  });

  it.each([['Has Spaces'], ['-leading'], ['trailing-'], ['double--hyphen'], ['ab']])(
    'rejects "%s" as a slug',
    (tenantSlug) => {
      expect(registerSchema.safeParse({ ...valid, tenantSlug }).success).toBe(false);
    },
  );

  it('lowercases a slug rather than rejecting it', () => {
    const result = registerSchema.parse({ ...valid, tenantSlug: 'NEW-CO' });
    expect(result.tenantSlug).toBe('new-co');
  });

  it('enforces the password policy on sign-up', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'weak' }).success).toBe(false);
  });
});

describe('inviteUserSchema', () => {
  it('accepts an invitation with roles', () => {
    const result = inviteUserSchema.safeParse({
      email: 'new@tenant.ae',
      fullName: 'New Person',
      roleKeys: [ROLES.SUPERVISOR],
    });
    expect(result.success).toBe(true);
  });

  it('requires at least one role', () => {
    const result = inviteUserSchema.safeParse({
      email: 'new@tenant.ae',
      fullName: 'New Person',
      roleKeys: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a role that is not in the catalogue', () => {
    const result = inviteUserSchema.safeParse({
      email: 'new@tenant.ae',
      fullName: 'New Person',
      roleKeys: ['ROOT'],
    });
    expect(result.success).toBe(false);
  });
});

describe('acceptInvitationSchema', () => {
  it('takes only the token, name and password', () => {
    const result = acceptInvitationSchema.parse({
      token: 'invitation-token',
      fullName: 'Invited Person',
      password: 'InvitedPassword1',
      // An invitee cannot choose their own roles or tenant; these keys are
      // unknown to the schema and are stripped before the service sees them.
      roleKeys: [ROLES.SUPER_ADMIN],
      tenantId: 'another-tenant',
    });

    expect(result).not.toHaveProperty('roleKeys');
    expect(result).not.toHaveProperty('tenantId');
  });

  it('enforces the password policy', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'invitation-token',
      fullName: 'Invited Person',
      password: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema and changePasswordSchema', () => {
  it('requires a token and a policy-compliant password to reset', () => {
    expect(resetPasswordSchema.safeParse({ token: '', password: 'NewPassword123' }).success).toBe(
      false,
    );
    expect(
      resetPasswordSchema.safeParse({ token: 'reset-token', password: 'NewPassword123' }).success,
    ).toBe(true);
  });

  it('holds only the new password to the policy when changing', () => {
    const result = changePasswordSchema.safeParse({
      // The current password is whatever it already is - re-validating it
      // would lock out anyone whose password predates the policy.
      currentPassword: 'old',
      newPassword: 'BrandNewPassword1',
    });
    expect(result.success).toBe(true);
  });
});
