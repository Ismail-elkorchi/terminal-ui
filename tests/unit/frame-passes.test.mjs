import assert from 'node:assert/strict';
import test from 'node:test';

import { boxDrawingJoinPass, createFrameBuffer, renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import { defaultTheme } from '../../dist/theme/index.js';
import { text } from '../../dist/widgets/index.js';

test('renderWidgetFrame applies frame passes after composition and before snapshot', () => {
  const pass = {
    id: 'test-marker',
    apply(buffer, context) {
      assert.equal(context.viewport.columns, 3);
      buffer.write(1, 1, [{ text: 'Z', source: { id: 'marker', role: 'custom' } }]);
    }
  };

  const frame = renderWidgetFrame(text('abc'), { columns: 3, rows: 1 }, { framePasses: [pass] });

  assert.equal(renderFramePlain(frame), 'Zbc');
  assert.deepEqual(frame.cells[0]?.source, { id: 'marker', role: 'custom' });
});

test('renderWidgetFrame can disable configured frame passes for debug and tests', () => {
  const pass = {
    id: 'test-marker',
    apply(buffer) {
      buffer.write(1, 1, [{ text: 'Z', source: { id: 'marker', role: 'custom' } }]);
    }
  };

  const frame = renderWidgetFrame(text('abc'), { columns: 3, rows: 1 }, {
    framePasses: [pass],
    disableFramePasses: true
  });

  assert.equal(renderFramePlain(frame), 'abc');
});

test('boxDrawingJoinPass merges source-marked box drawing crossings', () => {
  const buffer = createFrameBuffer(3, 3);
  buffer.write(2, 1, [{ text: '───', source: { role: 'border' } }]);
  buffer.write(1, 2, [{ text: '│', source: { role: 'border' } }]);
  buffer.write(3, 2, [{ text: '│', source: { role: 'border' } }]);

  boxDrawingJoinPass.apply(buffer, { theme: defaultTheme, viewport: { columns: 3, rows: 3 } });

  assert.equal(renderFramePlain(buffer.snapshot()), ' │\n─┼─\n │');
});

test('boxDrawingJoinPass supports ASCII crossings and ignores user text', () => {
  const ascii = createFrameBuffer(3, 3);
  ascii.write(2, 1, [{ text: '---', source: { role: 'border' } }]);
  ascii.write(1, 2, [{ text: '|', source: { role: 'border' } }]);
  ascii.write(3, 2, [{ text: '|', source: { role: 'border' } }]);

  boxDrawingJoinPass.apply(ascii, { theme: defaultTheme, viewport: { columns: 3, rows: 3 } });

  assert.equal(renderFramePlain(ascii.snapshot()), ' |\n-+-\n |');

  const userText = createFrameBuffer(3, 3);
  userText.write(2, 1, [{ text: '───', source: { role: 'text' } }]);
  userText.write(1, 2, [{ text: '│', source: { role: 'text' } }]);
  userText.write(3, 2, [{ text: '│', source: { role: 'text' } }]);

  boxDrawingJoinPass.apply(userText, { theme: defaultTheme, viewport: { columns: 3, rows: 3 } });

  assert.equal(renderFramePlain(userText.snapshot()), ' │\n───\n │');
});
