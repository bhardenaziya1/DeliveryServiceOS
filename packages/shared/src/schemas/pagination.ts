import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().trim().max(100).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
