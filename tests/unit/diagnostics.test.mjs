import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnostic } from '../../dist/diagnostics.js';

test('diagnostic ids do not depend on the process locale comparator', () => {
  const options = { data: { z: 1, 'ä': 2 } };
  const expected = diagnostic('TUI_RUN_FAILED', 'stable diagnostic', options).id;
  const localeCompare = String.prototype.localeCompare;
  try {
    String.prototype.localeCompare = function reversed(other) {
      return -localeCompare.call(this, other);
    };
    assert.equal(diagnostic('TUI_RUN_FAILED', 'stable diagnostic', options).id, expected);
  } finally {
    String.prototype.localeCompare = localeCompare;
  }
});

test('diagnostic ids distinguish contents that collide under the former 32-bit fingerprint', () => {
  const first = diagnostic('TUI_RUN_FAILED', 'candidate-5qshf2-1q2u');
  const second = diagnostic('TUI_RUN_FAILED', 'candidate-d5l61y-2d0e');

  assert.match(first.id, /^diagnostic:sha256:[0-9a-f]{64}$/u);
  assert.notEqual(first.id, second.id);
});

test('diagnostic ids implement canonical SHA-256 content identity', () => {
  assert.equal(
    diagnostic('TUI_RUN_FAILED', 'known vector').id,
    'diagnostic:sha256:4e3f5bf7abc346108725e70b4ed0dcee3f180fc43e0198741a1fc35567a2e0fa'
  );
});
