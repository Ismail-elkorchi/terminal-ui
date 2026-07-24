import type { PaginatorAction } from '../ui-model/paginator.ts';

export interface PaginatorState {
  readonly pageNumber: number;
}

export interface PaginatorReducerOptions {
  readonly pageCount: number;
}

export interface PaginatorPresentation {
  readonly pageNumber: number;
  readonly pageCount: number;
}

export interface PaginationInput {
  readonly pageNumber?: number;
  readonly pageSize: number;
  readonly totalCount: number;
}

export interface PaginationWindow {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
}

export function paginatorReducer(
  state: PaginatorState,
  action: PaginatorAction,
  options: PaginatorReducerOptions
): PaginatorState {
  const pageCount = normalizePageCount(options.pageCount);
  const current = normalizePageNumber(state.pageNumber, pageCount);
  const pageNumber = normalizePageNumber(pageNumberForAction(current, pageCount, action), pageCount);
  return pageNumber === state.pageNumber ? state : { pageNumber };
}

export function paginatorPresentation(
  state: PaginatorState,
  options: PaginatorReducerOptions
): PaginatorPresentation {
  const pageCount = normalizePageCount(options.pageCount);
  return { pageNumber: normalizePageNumber(state.pageNumber, pageCount), pageCount };
}

export function paginationWindow(input: PaginationInput): PaginationWindow {
  const total = Math.max(0, Math.floor(input.totalCount));
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageNumber = normalizePageNumber(input.pageNumber ?? 1, pageCount);
  const startIndex = total === 0 ? 0 : (pageNumber - 1) * pageSize;
  return {
    pageNumber,
    pageCount,
    startIndex,
    endIndexExclusive: Math.min(total, startIndex + pageSize)
  };
}

function pageNumberForAction(current: number, pageCount: number, action: PaginatorAction): number {
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
      return action.pageNumber;
  }
}

function normalizePageCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

function normalizePageNumber(value: number, pageCount: number): number {
  return Math.max(1, Math.min(pageCount, Math.floor(Number.isFinite(value) ? value : 1)));
}
