import type { TuiCancellation } from '../types.ts';

interface ChildOwner { readonly id: string; readonly generation: string | number; }
type WorkOwnership = readonly ChildOwner[];
// Metadata follows owned work values, never application state or historical IDs.
const ownership = new WeakMap<object, WorkOwnership>();

export function copyWorkOwnership<T extends object>(source: object, target: T): T {
  const path = ownership.get(source);
  if (path !== undefined) ownership.set(target, path);
  return target;
}

export function scopeWork<T extends object>(parent: ChildOwner, source: object, target: T): T {
  ownership.set(target, Object.freeze([
    Object.freeze({ id: parent.id, generation: parent.generation }),
    ...(ownership.get(source) ?? []),
  ]));
  return target;
}

export function cancellationMatches(request: TuiCancellation, work: { readonly id: string }): boolean {
  if (request.kind === 'effect') return request.id === work.id;
  const parents = ownership.get(request) ?? [];
  const path = ownership.get(work) ?? [];
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
