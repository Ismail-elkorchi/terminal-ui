import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnostic } from '../diagnostics.ts';
import { createRuntimeDiagnostics } from './runtime-diagnostics.ts';

void test('a failed diagnostic refresh does not spin and a later generation retries', async () => {
  let refreshes = 0;
  const diagnostics = createRuntimeDiagnostics({
    owner: 'diagnostic-refresh-failure',
    active: () => true,
    canRefresh: () => true,
    async refresh() {
      refreshes += 1;
      throw new Error('refresh failed');
    }
  });

  diagnostics.report(diagnostic('INPUT_TIMEOUT', 'first'));
  await diagnostics.settle();
  assert.equal(refreshes, 1);

  diagnostics.report(diagnostic('INPUT_TIMEOUT', 'second'));
  await diagnostics.settle();
  assert.equal(refreshes, 2);
});
