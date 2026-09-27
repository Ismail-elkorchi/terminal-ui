import assert from 'node:assert/strict';
import test from 'node:test';
import { dataGrid } from '../../../dist/components/index.js';
import { createTableCollection } from '../../../dist/behavior/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';

test('retained table painting never retains old application callbacks', async () => {
  const collection = createTableCollection([{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }], item => item.id);
  const columns = [{ id: 'value', header: 'Value', value: item => item.value }];
  let version = 1;
  const app = defineTui({ id: 'retained-callback', init: () => ({ state: 0 }),
    update: (_state, message) => ({ state: message }), view() {
      const current = version;
      return dataGrid({ id: 'table', meta: { accessibleName: 'Table' }, collection, columns,
        state: { interaction: { kind: 'row', activeRowId: 'a', selection: { mode: 'single' } } },
        onTransition: () => current });
    } });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 30, rows: 4 } }) });
  try {
    await runtime.start();
    version = 2;
    await runtime.redraw();
    await runtime.handleInputChunk({ data: '\u001b[B' });
    assert.equal(runtime.state(), 2);
  } finally { await runtime.dispose(); }
});
