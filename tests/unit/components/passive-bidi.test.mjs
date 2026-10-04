import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory, createLogViewerView, createScrollState, createTableCollection, menuBarView } from '../../../dist/behavior/index.js';
import { divider, logViewer, menuBar, pagination, richText, table, tableColumn, tabs, text } from '../../../dist/components/index.js';
import { diffFrames, renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementRegions } from '../../../dist/renderer/internal/render-element.js';
import { applyRenderDiff } from '../../../dist/renderer/internal/diff-interpreter.js';
import { defaultTextWidthProfile } from '../../../dist/text/index.js';

// Consumer fixture: reverse only the supplied Hebrew run. Segmentation and source
// ownership belong to the canonical index, not to a second test-side text engine.
function fixturePresentation() {
  const requests = [];
  return { requests, presentation: { map(request) {
    requests.push(request);
    const result = [];
    let run = [];
    const flush = () => { result.push(...run.reverse()); run = []; };
    for (const grapheme of request.graphemes) {
      const rtl = /\p{Script=Hebrew}/u.test(grapheme.text);
      if (!rtl) flush();
      const cluster = { ...grapheme, direction: rtl ? 'rtl' : 'ltr' };
      if (rtl) run.push(cluster);
      else result.push(cluster);
    }
    flush();
    return result;
  } } };
}

const inline = (text, extra = {}) => ({ kind: 'text', text, ...extra });
const size = { columns: 16, rows: 2 };
function pointer(target, column, kind = 'pointerDown', extra = {}) {
  return { kind, source: 'mouse', row: 1, column, localRow: 1, localColumn: column,
    button: 'left', modifiers: { shift: false, alt: false, ctrl: false },
    deltaRows: 0, deltaColumns: 0, targetId: target.id, ...extra };
}
function targets(element, bounds, options) {
  return renderElementRegions(element, bounds, options).flatMap(region => region.hitTargets);
}

test('rich text maps complete linked runs before clipping and uses those cells for hit fragments', () => {
  const { presentation } = fixturePresentation();
  const element = richText({ id: 'links', segments: [inline('abc '),
    inline('א', { link: { href: 'https://example.com/one' }, style: { bold: true } }),
    inline('בג', { link: { href: 'https://example.com/two' }, style: { italic: true } }), inline(' def')],
    onLinkActivate: event => ({ event }) });
  const bounds = { columns: 5, rows: 1 };
  const options = { textPresentation: presentation };
  const frame = renderElementFrame(element, bounds, options);
  assert.equal(renderFramePlain(frame), 'abc ג');
  const glyph = frame.cells.find(cell => cell.text === 'ג');
  assert.equal(glyph?.link?.href, 'https://example.com/two');
  assert.equal(glyph?.style?.italic, true);
  const hits = targets(element, bounds, options);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].bounds.column, 5);
  assert.equal(hits[0].bounds.width, 1);
  assert.equal(hits[0].message(pointer(hits[0], 5, 'click')).event.link.href, 'https://example.com/two');
  assert.equal(frame.accessibility.root.value, 'abc אבג def');
});

test('rich text link targets omit a clipped wide grapheme in both wrapped and unwrapped rows', () => {
  for (const wrap of [false, true]) {
    const element = richText({ id: 'wide', segments: [inline('界', { link: { href: 'https://example.com/wide' } })],
      wrap, onLinkActivate: event => ({ event }) });
    const options = { textPresentation: fixturePresentation().presentation };
    assert.equal(renderFramePlain(renderElementFrame(element, { columns: 1, rows: 1 }, options)), '');
    assert.deepEqual(targets(element, { columns: 1, rows: 1 }, options), []);
  }
});

test('log viewer shares visual source ownership across paint, search, selection and pointer', () => {
  const { presentation } = fixturePresentation();
  const history = createLogHistory([{ id: 'one', text: 'abc אבג def' }]);
  const view = createLogViewerView({ history, query: { text: 'בג' } });
  const selection = { anchor: { entryId: 'one', offset: 4 }, focus: { entryId: 'one', offset: 5 } };
  const element = logViewer({ id: 'log', history, view, query: { text: 'בג' }, selection,
    scroll: createScrollState(), scrollbar: { visible: 'never' }, onTransition: action => ({ action }) });
  const options = { textPresentation: presentation };
  const frame = renderElementFrame(element, size, options);
  assert.equal(renderFramePlain(frame), 'abc גבא def');
  assert.equal(frame.cells.filter(cell => cell.source?.partType === 'match').map(cell => cell.text).join(''), 'גב');
  assert.equal(frame.cells.filter(cell => cell.source?.partName === 'body.selection').map(cell => cell.text).join(''), 'א');
  assert.equal(frame.accessibility.root.children[0].value, 'abc אבג def');
  const hit = targets(element, size, options).find(target => target.id === 'log:text');
  assert.equal(hit.message(pointer(hit, 5)).action.transition.position.offset, 7);
  assert.equal(hit.message(pointer(hit, 6)).action.transition.position.offset, 6);
  assert.equal(hit.message(pointer(hit, 7)).action.transition.position.offset, 5);
  assert.equal(renderFramePlain(renderElementFrame(element, { columns: 6, rows: 1 }, options)), 'abc גב');
});

test('wrapped log rows retain full paragraph context and logical row source offsets', () => {
  const { presentation, requests } = fixturePresentation();
  const history = createLogHistory([{ id: 'one', text: 'abc אבג def' }]);
  const view = createLogViewerView({ history, wrap: true, width: 6, widthProfile: defaultTextWidthProfile });
  const element = logViewer({ id: 'wrapped', history, view, wrap: true,
    scroll: createScrollState(), scrollbar: { visible: 'never' }, onTransition: action => ({ action }) });
  const frame = renderElementFrame(element, { columns: 6, rows: 2 }, { textPresentation: presentation });
  assert.equal(renderFramePlain(frame), 'abc בא\nג def');
  const mapped = requests.filter(request => request.text.includes('אבג'));
  assert.ok(mapped.length >= 2);
  assert.ok(mapped.every(request => request.text === 'abc אבג def'));
  assert.ok(mapped.some(request => request.startOffset === 6 && request.endOffsetExclusive === 11));
});

test('table cell clipping and horizontal slicing preserve visual style and link ownership', () => {
  const { presentation } = fixturePresentation();
  const collection = createTableCollection([{ id: 'one', label: 'abc אבג def' }], row => row.id);
  const column = tableColumn({ id: 'value', width: 11, value: row => row.label,
    render: () => [inline('abc א', { style: { bold: true } }),
      inline('בג', { style: { italic: true }, link: { href: 'https://example.com/cell' } }), inline(' def')] });
  const element = table({ id: 'table', meta: { accessibleName: 'Table' }, collection, columns: [column],
    scroll: { state: createScrollState({ offsetColumn: 4 }), onScroll: request => ({ request }) },
    scrollbar: { visible: 'never' } });
  const frame = renderElementFrame(element, { columns: 5, rows: 1 }, { textPresentation: presentation });
  assert.equal(renderFramePlain(frame), 'גבא d');
  const glyph = frame.cells.find(cell => cell.text === 'ג');
  assert.equal(glyph?.style?.italic, true);
  assert.equal(glyph?.link?.href, 'https://example.com/cell');
  const clipped = table({ id: 'clip', meta: { accessibleName: 'Table' }, collection,
    columns: [{ ...column, width: 6 }] });
  assert.equal(renderFramePlain(renderElementFrame(clipped, { columns: 6, rows: 1 }, { textPresentation: presentation })), 'abc ג…');
});

test('passive presentation changes invalidate local paint caches and diff replays exact visual cells', () => {
  const { presentation } = fixturePresentation();
  const history = createLogHistory([{ id: 'one', text: 'abc אבג def' }]);
  const element = logViewer({ id: 'cached-log', history, view: null });
  const before = renderElementFrame(element, size);
  const after = renderElementFrame(element, size, { textPresentation: presentation });
  assert.equal(renderFramePlain(before), 'abc אבג def');
  assert.equal(renderFramePlain(after), 'abc גבא def');
  const replayed = applyRenderDiff(before, diffFrames(before, after));
  assert.deepEqual(replayed.cells, after.cells);
  const label = divider({ label: 'abc אבג def' });
  assert.equal(renderFramePlain(renderElementFrame(label, { columns: 7, rows: 1 }, { textPresentation: presentation })), ' abc גב');
});

test('log pointers keep repeated logical substrings and multiline grapheme offsets distinct', () => {
  const { presentation } = fixturePresentation();
  const history = createLogHistory([{ id: 'one', text: '\nאבג\nאבג 👩‍🚀 é' }]);
  const element = logViewer({ id: 'repeat', history, view: null,
    scroll: createScrollState(), scrollbar: { visible: 'never' }, onTransition: action => ({ action }) });
  const options = { textPresentation: presentation };
  const bounds = { columns: 16, rows: 1 };
  const frame = renderElementFrame(element, bounds, options);
  assert.equal(renderFramePlain(frame), 'גבאגבא 👩‍🚀 é');
  const hit = targets(element, bounds, options).find(target => target.id === 'repeat:text');
  assert.equal(hit.message(pointer(hit, 1)).action.transition.position.offset, 4);
  assert.equal(hit.message(pointer(hit, 4)).action.transition.position.offset, 8);
  assert.equal(hit.message(pointer(hit, 8)).action.transition.position.offset, 9);
  assert.equal(hit.message(pointer(hit, 9)).action.transition.position.offset, 9);
});

test('table scrolling preserves the position of text after a partially clipped wide cell', () => {
  const element = table({ id: 'wide-table', meta: { accessibleName: 'Table' },
    collection: createTableCollection([{ id: 'one', value: '界AB' }], row => row.id),
    columns: [{ id: 'value', width: 4, value: row => row.value }],
    scroll: { state: createScrollState({ offsetColumn: 1 }), onScroll: request => ({ request }) },
    scrollbar: { visible: 'never' } });
  const options = { textPresentation: fixturePresentation().presentation };
  const frame = renderElementFrame(element, { columns: 3, rows: 1 }, options);
  assert.equal(renderFramePlain(frame), ' AB');
  assert.equal(frame.cells.find(cell => cell.text === 'A').column, 2);
});


test('independent menu, tab and pagination targets retain their visual chrome positions', () => {
  const presentation = { map: request => request.graphemes.map(g => ({ ...g, direction: 'rtl' })).reverse() };
  const items = [{ kind: 'action', id: 'one', label: 'abc' }, { kind: 'action', id: 'two', label: 'def' }];
  const menu = menuBar({ id: 'menu', meta: { accessibleName: 'Menu' }, items,
    view: menuBarView(items, { kind: 'closed', active: 'one' }), onTransition: action => ({ action }) });
  const menuFrame = renderElementFrame(menu, { columns: 20, rows: 1 }, { textPresentation: presentation });
  const one = menuFrame.cells.filter(cell => cell.source?.itemId === 'one');
  const two = menuFrame.cells.filter(cell => cell.source?.itemId === 'two');
  assert.equal(one.map(cell => cell.text).join('').slice(-3), 'cba');
  assert.equal(two.map(cell => cell.text).join('').slice(-3), 'fed');
  assert.ok(one.at(-1).column < two[0].column);
  const tab = tabs({ id: 'tabs', meta: { accessibleName: 'Tabs' }, state: { selectedId: 'one', activeId: 'one' },
    tabs: [{ id: 'one', label: 'abc', closable: true, panel: text({ content: 'panel' }) }],
    onTransition: action => ({ action }), onClose: event => ({ event }) });
  const tabFrame = renderElementFrame(tab, { columns: 16, rows: 2 }, { textPresentation: presentation });
  assert.equal(tabFrame.cells.filter(cell => cell.source?.partName === 'label' && cell.source?.itemId === 'one').map(cell => cell.text).join(''), 'cba');
  const close = tabFrame.cells.find(cell => cell.source?.partName === 'close');
  const closeTarget = tabFrame.hitTargets.find(target => target.id === 'tabs:tab:one:close');
  assert.equal(closeTarget.bounds.column, close.column);
  const page = pagination({ id: 'pages', label: 'abc', pageNumber: 2, pageCount: 3, onTransition: action => ({ action }) });
  const pageFrame = renderElementFrame(page, { columns: 45, rows: 1 }, { textPresentation: presentation });
  assert.ok(renderFramePlain(pageFrame).startsWith('cba  «'));
  const first = pageFrame.hitTargets.find(target => target.id === 'pages:first');
  assert.equal(first.bounds.column, pageFrame.cells.find(cell => cell.source?.partName === 'control.first').column);
});

test('table retained rows use the current presentation identity', () => {
  const element = table({ id: 'same-table', meta: { accessibleName: 'Table' },
    collection: createTableCollection([{ id: 'one', value: 'אבג' }], row => row.id),
    columns: [{ id: 'value', width: 3, value: row => row.value }] });
  const bounds = { columns: 3, rows: 1 };
  const visual = renderElementFrame(element, bounds, { textPresentation: fixturePresentation().presentation });
  const logical = renderElementFrame(element, bounds);
  assert.equal(renderFramePlain(visual), 'גבא');
  assert.equal(renderFramePlain(logical), 'אבג');
  assert.deepEqual(applyRenderDiff(visual, diffFrames(visual, logical)).cells, logical.cells);
});
