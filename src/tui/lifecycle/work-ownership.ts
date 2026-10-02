import type { TuiCancellation } from '../types.ts';

interface ChildOwner { readonly id: string; readonly generation: string | number; }
type WorkOwnership = readonly ChildOwner[];
// Enumerable metadata survives whole-descriptor copies, including decorated callbacks.
// Only immutable paths issued here are accepted; neither scopes nor a registry are public.
const ownership = Symbol('TUI work ownership');
const issuedPaths = new WeakSet<WorkOwnership>();

export function copyWorkOwnership<const T extends object>(source: object, target: T): T {
  const path = workOwnership(source);
  return path === undefined ? target : attachOwnership(target, path);
}

export function scopeWork<T extends object>(parent: ChildOwner, source: object, target: T): T {
  const path = Object.freeze([
    Object.freeze({ id: parent.id, generation: parent.generation }),
    ...(workOwnership(source) ?? []),
  ]);
  issuedPaths.add(path);
  return attachOwnership(target, path);
}

export function cancellationMatches(request: TuiCancellation, work: { readonly id: string }): boolean {
  if (request.kind === 'effect') return request.id === work.id;
  const parents = workOwnership(request) ?? [];
  const path = workOwnership(work) ?? [];
  if (path.length <= parents.length) return false;
  for (let index = 0; index < parents.length; index += 1) {
    if (!sameOwner(parents[index], path[index])) return false;
  }
  return sameOwner(request, path[parents.length]);
}

export function removedWork(work: { readonly id: string }, requests: readonly TuiCancellation[]): boolean {
  return requests.some((request) => request.kind === 'child' && cancellationMatches(request, work));
}

function sameOwner(left: ChildOwner | undefined, right: ChildOwner | undefined): boolean {
  return left !== undefined && left.id === right?.id && left.generation === right.generation;
}

function workOwnership(work: object): WorkOwnership | undefined {
  const path = (work as { readonly [ownership]?: WorkOwnership })[ownership];
  if (path !== undefined && !issuedPaths.has(path)) throw new TypeError('TUI work ownership is invalid.');
  return path;
}

function attachOwnership<T extends object>(work: T, path: WorkOwnership): T {
  return Object.defineProperty(work, ownership, { value: path, enumerable: true, writable: false, configurable: false });
}
