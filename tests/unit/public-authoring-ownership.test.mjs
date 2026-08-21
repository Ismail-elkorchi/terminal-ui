import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost, createTerminalHost } from '../../dist/host/index.js';
import { createInputPipeline } from '../../dist/input/index.js';
import { defineTui, projectTuiBindingHelp } from '../../dist/tui/index.js';

test('public authoring boundaries retain the values they validate', async () => {
  const init = () => 0;
  let initReads = 0;
  let bindingIdReads = 0;
  const app = defineTui({
    id: 'owned-definition',
    get init() {
      initReads += 1;
      return initReads === 1 ? init : 'invalid-after-validation';
    },
    update: (state) => state,
    view: () => ({ kind: 'unused' }),
    inputBindings: [{
      get id() {
        bindingIdReads += 1;
        return bindingIdReads === 1 ? 'owned-binding' : '';
      },
      triggers: [{ kind: 'key', key: 'q' }],
      label: 'Quit',
      message: 'quit'
    }]
  });

  assert.equal(initReads, 1);
  assert.equal(bindingIdReads, 1);
  assert.deepEqual(projectTuiBindingHelp(app), [{
    id: 'owned-binding',
    label: 'Quit',
    bindings: [{ binding: { kind: 'key', key: 'q' }, label: 'Quit' }],
  }]);

  let pasteReads = 0;
  const pipeline = createInputPipeline({
    get bracketedPaste() {
      pasteReads += 1;
      return pasteReads === 1 ? true : 'invalid-after-validation';
    }
  });
  assert.equal(pasteReads, 1);
  assert.equal(pipeline.profile.bracketedPaste, true);

  let memoryIdReads = 0;
  const memory = createMemoryTerminalHost({
    get id() {
      memoryIdReads += 1;
      return memoryIdReads === 1 ? 'owned-memory' : 'changed-memory';
    }
  });
  assert.equal(memoryIdReads, 1);
  assert.equal(memory.id, 'owned-memory');
  await memory.dispose();

  let runtimeReads = 0;
  const selected = createTerminalHost({
    get runtime() {
      runtimeReads += 1;
      return runtimeReads === 1 ? 'memory' : 'node';
    }
  });
  assert.equal(runtimeReads, 1);
  assert.equal(selected.runtime, 'memory');
  await selected.dispose();
});
