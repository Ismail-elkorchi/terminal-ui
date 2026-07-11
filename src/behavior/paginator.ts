import type { PaginatorAction } from '../components/paginator.ts';

export interface PaginatorState {
  readonly page: number;
}

export interface PaginatorReducerOptions {
  readonly pageCount: number;
}

export interface PaginatorPresentation {
  readonly page: number;
  readonly pageCount: number;
}

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

export function paginatorReducer(
  state: PaginatorState,
  action: PaginatorAction,
  options: PaginatorReducerOptions
): PaginatorState {
  const pageCount = normalizePageCount(options.pageCount);
  const current = normalizePage(state.page, pageCount);
  const page = normalizePage(pageForAction(current, pageCount, action), pageCount);
  return page === state.page ? state : { page };
}

export function paginatorPresentation(
  state: PaginatorState,
  options: PaginatorReducerOptions
): PaginatorPresentation {
  const pageCount = normalizePageCount(options.pageCount);
  return { page: normalizePage(state.page, pageCount), pageCount };
}

export function paginationWindow(input: PaginationInput): PaginationWindow {
  const total = Math.max(0, Math.floor(input.total));
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = normalizePage(input.page ?? 1, pageCount);
  const start = total === 0 ? 0 : (page - 1) * pageSize;
  return { page, pageCount, start, end: Math.min(total, start + pageSize) };
}

function pageForAction(current: number, pageCount: number, action: PaginatorAction): number {
  switch (action.kind) {
    case 'first':
      return 1;
    case 'previous':
      return current - 1;
    case 'next':
      return current + 1;
    case 'last':
      return pageCount;
    case 'select':
      return action.page;
  }
}

function normalizePageCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

function normalizePage(value: number, pageCount: number): number {
  return Math.max(1, Math.min(pageCount, Math.floor(Number.isFinite(value) ? value : 1)));
}
