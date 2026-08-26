import type { PaginationTransition } from './pagination.ts';

export interface PaginationState {
  readonly pageNumber: number;
}

export interface PaginationReducerOptions {
  readonly pageCount: number;
}

export interface PaginationView {
  readonly pageNumber: number;
  readonly pageCount: number;
}

export interface PaginationWindowInput {
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

export function paginationReducer(
  state: PaginationState,
  transition: PaginationTransition,
  options: PaginationReducerOptions
): PaginationState {
  const pageCount = normalizePageCount(options.pageCount);
  const current = normalizePageNumber(state.pageNumber, pageCount);
  const pageNumber = normalizePageNumber(pageNumberForTransition(current, pageCount, transition), pageCount);
  return pageNumber === state.pageNumber ? state : { pageNumber };
}

export function paginationView(
  state: PaginationState,
  options: PaginationReducerOptions
): PaginationView {
  const pageCount = normalizePageCount(options.pageCount);
  return { pageNumber: normalizePageNumber(state.pageNumber, pageCount), pageCount };
}

export function paginationWindow(input: PaginationWindowInput): PaginationWindow {
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

function pageNumberForTransition(current: number, pageCount: number, transition: PaginationTransition): number {
  switch (transition.kind) {
    case 'first':
      return 1;
    case 'previous':
      return current - 1;
    case 'next':
      return current + 1;
    case 'last':
      return pageCount;
    case 'select':
      return transition.pageNumber;
  }
}

function normalizePageCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

function normalizePageNumber(value: number, pageCount: number): number {
  return Math.max(1, Math.min(pageCount, Math.floor(Number.isFinite(value) ? value : 1)));
}
