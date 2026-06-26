export interface PaginationInput {
  readonly page?: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface PaginationWindow {
  readonly page: number;
  readonly pageCount: number;
  readonly start: number;
  readonly end: number;
}

export function paginationWindow(input: PaginationInput): PaginationWindow {
  const total = Math.max(0, Math.floor(input.total));
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pageCount, Math.floor(input.page ?? 1)));
  const start = total === 0 ? 0 : (page - 1) * pageSize;
  return {
    page,
    pageCount,
    start,
    end: Math.min(total, start + pageSize)
  };
}
