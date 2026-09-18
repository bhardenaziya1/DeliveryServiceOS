import { PaginatedResult, PaginationQuery } from '@vendoros/shared';

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQuery, 'page' | 'pageSize'>,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
