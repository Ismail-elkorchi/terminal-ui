import assert from 'node:assert/strict';
import test from 'node:test';
import { disclosure, richText, text } from '../../../dist/components/index.js';
import { measuredViewport } from '../../../dist/layout/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { defaultTheme, noColorTheme } from '../../../dist/theme/index.js';
import { componentElement, leafComponentDefinition } from '../../support/component-definition.mjs';

test('measured viewport constrains wrapping and disclosures to the scrollbar-adjusted width', () => {
  for (const expanded of [false, true]) {
    const entries = [
      richText({ id: 'wrapped', segments: [{ kind: 'text', text: '文 · e\u0301 words '.repeat(20) }], wrap: { preserveWords: true } }),
      disclosure({ id: 'disclosure', label: 'A long disclosure header '.repeat(8), expanded,
        onTransition: () => 'toggle', slots: { content: text({ content: 'Expanded body '.repeat(10) }) } }),
      text({ id: 'tail', content: 'Tail' }),
    ];
    const environments = [defaultTheme, noColorTheme].flatMap((theme) =>
      ['narrow', 'wide'].map((ambiguous) => ({ theme, widthProfile: { emoji: 'wide', ambiguous } })));
    for (const environment of environments) {
      for (const visible of ['always', 'auto', 'never']) {
        for (const columns of [48, 12, 80, 12]) {
          for (const offset of [0, 5, 500]) {
            const result = renderElementInternal(measuredViewport(entries, {
              id: 'viewport', offset: { row: offset }, onScroll: () => 'scroll',
              scrollbar: { axis: 'vertical', visible },
            }), { columns, rows: 5 }, environment);
            const content = result.layout.children[0];
            const expectedWidth = columns - Number(visible === 'always'
              || visible === 'auto' && content.bounds.height > 5);
            assert.equal(content.bounds.width, expectedWidth);
            for (const child of content.children) assert.equal(child.bounds.width, expectedWidth);
            assert.ok(content.children.length <= entries.length);
            if (offset === 500) assert.equal(content.children.at(-1).id, 'tail');
          }
        }
      }
    }
  }
});

test('measured viewport uses one scrollbar decision even for non-monotonic entry heights', () => {
  const entry = componentElement({ id: 'responsive-entry', definition: {
    ...leafComponentDefinition,
    measure: ({ constraints }) => ({ minWidth: 0, minHeight: 0,
      preferredWidth: constraints.width, preferredHeight: constraints.width >= 5 ? 6 : 1 }),
    render: () => {},
    accessibility: ({ id }) => ({ id, role: 'text' }),
  } });
  const result = renderElementInternal(measuredViewport([entry], {
    id: 'responsive-viewport', scrollbar: { visible: 'auto' }, onScroll: () => 'scroll',
  }), { columns: 5, rows: 3 });
  const content = result.layout.children[0];
  const child = content.children[0];
  assert.equal(child.bounds.width, content.bounds.width);
  assert.equal(child.bounds.height, child.bounds.width >= 5 ? 6 : 1);
});

test('streaming replacements with the same id invalidate retained geometry', () => {
  const tail = text({ id: 'tail', content: 'Tail' });
  const render = (count) => renderElementInternal(measuredViewport([
    richText({ id: 'stream', segments: [{ kind: 'text', text: 'word '.repeat(count) }], wrap: true }),
    tail,
  ], { id: 'streaming', scrollbar: { visible: 'auto' }, onScroll: () => 'scroll' }),
  { columns: 12, rows: 3 });
  const initial = render(1);
  const grown = render(30);
  const shrunk = render(1);
  assert.ok(grown.layout.children[0].bounds.height > initial.layout.children[0].bounds.height);
  assert.equal(grown.layout.children[0].bounds.width, 11);
  assert.equal(shrunk.layout.children[0].bounds.width, 12);
  assert.deepEqual(shrunk.layout, initial.layout);
});

test('measured viewport follows growing content and preserves entry anchors after prepend and resize', () => {
  let layout;
  const render = (entries, options = {}, columns = 12) => renderElementInternal(measuredViewport(entries, {
    id: 'anchored', onScroll: () => 'scroll', scrollbar: { visible: 'auto' },
    onLayout: (value) => { layout = value; }, ...options,
  }), { columns, rows: 3 });
  const entry = (id, count) => richText({ id, segments: [{ kind: 'text', text: 'word '.repeat(count) }], wrap: true });
  render([entry('first', 8), entry('last', 10)], { followTail: true });
  assert.equal(layout.scroll.offsetRow, layout.geometry.contentRows - 3);
  const previousBottom = layout.scroll.offsetRow;
  render([entry('first', 8), entry('last', 20)], { followTail: true });
  assert.ok(layout.scroll.offsetRow > previousBottom);
  const anchor = { itemId: 'last', rowWithinItem: 1, viewportRow: 0 };
  render([entry('first', 8), entry('last', 20)], { anchor });
  assert.equal(layout.scroll.offsetRow, layout.entries[1].rowOffset + 1);
  render([entry('prepended', 15), entry('first', 8), entry('last', 20)], { anchor }, 9);
  assert.equal(layout.scroll.offsetRow, layout.entries[2].rowOffset + 1);
  assert.equal(layout.geometry.viewportColumns, 8);
  render([entry('last', 1)], { followTail: true });
  assert.equal(layout.scroll.offsetRow, 0);
  assert.equal(layout.geometry.viewportColumns, 12);
});
