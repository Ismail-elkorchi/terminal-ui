import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTuiEventSources, decodeTuiUpdateResult } from '../hook-results.ts';
import { cancellationMatches, scopeWork } from './work-ownership.ts';

void test('nested source ownership survives callback and channel decoration through normalization', () => {
  const leaf = { id: 'leaf', generation: 1 };
  const parent = { id: 'parent', generation: 2 };
  const local = scopeWork(leaf, {}, { id: 'feed', generation: 3, run() {} });
  const source = scopeWork(parent, local, { ...local });
  const removal = scopeWork(parent, {}, { kind: 'child' as const, ...leaf });
  const [normalized] = decodeTuiEventSources([{ ...source, channel: { capacity: 2 }, run() {} }]);
  const [cancel] = decodeTuiUpdateResult({ state: 0, cancel: [{ ...removal }] }).cancel ?? [];
  assert.ok(normalized);
  assert.ok(cancel?.kind === 'child');
  assert.equal(cancellationMatches(cancel, normalized), true);
  assert.equal(cancellationMatches({ kind: 'child', ...parent }, normalized), true);
  assert.equal(cancellationMatches({ kind: 'child', ...leaf }, normalized), false);
  assert.equal(cancellationMatches({ ...cancel, generation: 2 }, normalized), false);
  const siblingRemoval = scopeWork({ id: 'sibling', generation: 2 }, {}, { kind: 'child' as const, ...leaf });
  assert.equal(cancellationMatches(siblingRemoval, normalized), false);
});

void test('ownership normalization accepts only package-issued immutable paths', () => {
  const extra = Symbol('application metadata');
  const source = scopeWork({ id: 'owner', generation: 1 }, {}, { id: 'feed', generation: 1, run() {} });
  const [key] = Object.getOwnPropertySymbols(source);
  assert.ok(key);
  assert.equal(Object.getOwnPropertyDescriptor(source, key)?.writable, false);
  const path: unknown = Reflect.get(source, key);
  assert.ok(Array.isArray(path));
  assert.equal(Object.isFrozen(path), true);
  assert.equal(Object.isFrozen(path[0]), true);
  const [normalized] = decodeTuiEventSources([{ ...source, [extra]: true }]);
  assert.ok(normalized);
  assert.equal(Object.isFrozen(normalized), true);
  assert.deepEqual(Object.getOwnPropertySymbols(normalized), [key]);
  assert.equal(Reflect.get(normalized, key), path);
  assert.throws(() => decodeTuiEventSources([{ ...source, [key]: [...path as readonly unknown[]] }]), /ownership is invalid/u);
  assert.throws(() => decodeTuiUpdateResult({
    state: 0,
    cancel: [{ kind: 'child', id: 'owner', generation: 1, [key]: [] }],
  }), /ownership is invalid/u);
});
