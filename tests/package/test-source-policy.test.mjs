import assert from 'node:assert/strict';
import test from 'node:test';
import { findDisabledNodeTests } from '../../scripts/test-source-policy.mjs';

test('test source policy rejects method and option based disabled tests', () => {
  const source = `
    import check, { describe as group } from 'node:test';
    import * as nodeTest from 'node:test';
    check.skip('method skip', () => undefined);
    check('option skip', { skip: true }, () => undefined);
    group('option todo', { todo: 'later' }, () => undefined);
    nodeTest.test('option only', { only: enabled }, () => undefined);
  `;

  assert.deepEqual(findDisabledNodeTests('policy.test.mjs', source).map(({ kind }) => kind), [
    'skip',
    'skip',
    'todo',
    'only'
  ]);
});

test('test source policy permits explicitly disabled options set to false', () => {
  const source = `
    import { test as check } from 'node:test';
    check('active', { skip: false, todo: false, only: false }, () => undefined);
  `;

  assert.deepEqual(findDisabledNodeTests('policy.test.ts', source), []);
});
