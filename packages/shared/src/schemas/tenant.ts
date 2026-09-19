import { z } from 'zod';

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2, 'Enter a company name').max(160).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

/**
 * Turns a company name into a URL-safe tenant slug.
 *
 * Shared so the sign-up form can preview the slug the API will assign, rather
 * than the two sides drifting into different results for the same input.
 */
export function slugifyTenantName(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Strip combining marks so "Fzé" becomes "fze" rather than losing the letter.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '')
  );
}
