import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTuiEventSources, decodeTuiUpdateResult } from '../hook-results.ts';
import { ownTuiContribution, ownTuiSource } from './contribution.ts';
import { cancellationMatches, scopeWork } from './work-ownership.ts';

void test('opaque nested source and removal contributions retain private ownership through normalization', () => {
  const leaf = { id: 'leaf', generation: 1 };
  const parent = { id: 'parent', generation: 2 };
  const local = scopeWork(leaf, {}, { id: 'feed', generation: 3, run() {} });
  const source = scopeWork(parent, local, { ...local });
  const removal = scopeWork(parent, {}, { kind: 'child' as const, ...leaf });
  const handle = ownTuiSource(source);
  const contribution = ownTuiContribution([{ cancel: [removal] }]);
  const [normalized] = decodeTuiEventSources([handle]);
  const [cancel] = decodeTuiUpdateResult({ state: 0, contribution }).contributions[0]?.cancel ?? [];
  assert.ok(normalized);
  assert.ok(cancel?.kind === 'child');
  assert.equal(cancellationMatches(cancel, normalized), true);
  assert.equal(cancellationMatches({ kind: 'child', ...parent }, normalized), true);
  assert.equal(cancellationMatches({ kind: 'child', ...leaf }, normalized), false);
  const siblingRemoval = scopeWork({ id: 'sibling', generation: 2 }, {}, { kind: 'child' as const, ...leaf });
  assert.equal(cancellationMatches(siblingRemoval, normalized), false);
  assert.deepEqual(Object.keys(handle), []);
  assert.deepEqual(Object.getOwnPropertySymbols(handle), []);
  assert.deepEqual(Object.getOwnPropertySymbols(source), []);
});

void test('only issued opaque capabilities are accepted; whole result lifting remains valid', () => {
  const handle = ownTuiSource({ id: 'feed', generation: 1, run() {} });
  const contribution = ownTuiContribution([{ cancel: [{ kind: 'effect', id: 'work' }] }]);
  const result = { state: 0, contribution };
  assert.equal(Object.isFrozen(handle), true);
  assert.equal(Object.isFrozen(contribution), true);
  assert.equal(decodeTuiUpdateResult({ ...result }).contributions[0]?.cancel?.[0]?.id, 'work');
  assert.throws(() => decodeTuiEventSources([{ ...handle }]), /id/u);
  assert.throws(() => decodeTuiUpdateResult({ state: 0, contribution: { ...contribution } }), /owned result contribution/u);
  const reconstructed: unknown = JSON.parse(JSON.stringify(contribution));
  assert.throws(() => decodeTuiUpdateResult({ state: 0, contribution: reconstructed }), /owned result contribution/u);
});
