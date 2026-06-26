import assert from 'node:assert/strict';
import test from 'node:test';

import { commandBarReducer, renderWidgetFrame } from '../../dist/tui/index.js';
import { commandBar } from '../../dist/widgets/index.js';

test('commandBarReducer edits, navigates history, and accepts suggestions', () => {
  const initial = {
    input: { text: '', cursor: 0 },
    history: ['build', 'test'],
    suggestions: ['test --watch', 'test --coverage']
  };

  const typed = commandBarReducer(initial, { kind: 'insert', text: 't' });
  assert.deepEqual(typed.input, { text: 't', cursor: 1 });
  assert.equal('historyIndex' in typed, false);

  const previous = commandBarReducer(typed, { kind: 'historyPrevious' });
  assert.deepEqual(previous.input, { text: 'test', cursor: 4 });
  assert.equal(previous.historyIndex, 1);

  const earlier = commandBarReducer(previous, { kind: 'historyPrevious' });
  assert.deepEqual(earlier.input, { text: 'build', cursor: 5 });
  assert.equal(earlier.historyIndex, 0);

  const selected = commandBarReducer(earlier, { kind: 'selectSuggestion', direction: 1 });
  assert.equal(selected.selectedSuggestion, 0);

  const accepted = commandBarReducer(selected, { kind: 'acceptSuggestion' });
  assert.deepEqual(accepted.input, { text: 'test --watch', cursor: 12 });
  assert.equal('selectedSuggestion' in accepted, false);
});

test('commandBar widget renders prompt, suggestions, cursor, and accessibility', () => {
  const frame = renderWidgetFrame(
    commandBar({
      id: 'command',
      prompt: '/',
      value: 'op',
      cursor: 2,
      suggestions: [
        { value: 'open', label: 'open', description: 'Open item' },
        { value: 'options', label: 'options' }
      ],
      selectedSuggestion: 1
    }),
    { columns: 30, rows: 4 }
  );

  const text = frame.cells.map((cell) => cell.text).join('');
  assert.match(text, /\/op/u);
  assert.match(text, /open - Open item/u);
  assert.match(text, /›/u);
  assert.deepEqual(frame.cursor, { row: 1, column: 4 });
  assert.equal(frame.accessibility.root.role, 'textbox');
  assert.equal(frame.accessibility.root.value, 'op');
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
});
