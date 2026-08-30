import assert from 'node:assert/strict';
import test from 'node:test';

import { failure, success } from '../../dist/index.js';

test('result constructors preserve success and failure payloads without optional noise', () => {
  const succeeded = success(42);
  const error = new Error('failed');
  const failed = failure(error);

  assert.deepEqual(succeeded, { status: 'success', value: 42 });
  assert.deepEqual(failed, { status: 'failure', error });
});
