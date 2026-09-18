import { describe, expect, it } from 'vitest';
import { createProjectSchema } from './project';
import { ProjectStatus } from '../types/enums';

const validProject = {
  clientId: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Dubai Last-Mile Delivery',
  code: 'SWIFT-DXB-01',
  status: ProjectStatus.DRAFT,
  startDate: '2026-01-01',
};

describe('createProjectSchema', () => {
  it('accepts a valid project payload', () => {
    const result = createProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid clientId', () => {
    const result = createProjectSchema.safeParse({ ...validProject, clientId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a lowercase project code', () => {
    const result = createProjectSchema.safeParse({ ...validProject, code: 'swift-dxb-01' });
    expect(result.success).toBe(false);
  });

  it('rejects a project code with spaces', () => {
    const result = createProjectSchema.safeParse({ ...validProject, code: 'SWIFT DXB 01' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing start date', () => {
    const result = createProjectSchema.safeParse({ ...validProject, startDate: '' });
    expect(result.success).toBe(false);
  });
});
