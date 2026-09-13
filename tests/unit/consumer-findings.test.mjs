import assert from 'node:assert/strict';
import test from 'node:test';
import { button, dialog, disclosure, richText, text, textArea } from '../../dist/components/index.js';
import { column, measuredViewport, overlay, viewport } from '../../dist/layout/index.js';
import { createMemoryTerminalHost, resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createTextAreaState, textAreaReducer } from '../../dist/behavior/index.js';
import { defineTextWidthProfile, textDocumentLength } from '../../dist/text/index.js';
import { renderElementInternal } from '../../dist/renderer/internal/render-element.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { defaultTheme, noColorTheme } from '../../dist/theme/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';
import { componentElement, leafComponentDefinition } from '../helpers/component-definition.mjs';

const key = (name, modifiers = {}) => ({
  kind: 'key', key: name, eventType: 'press', location: 'standard',
  modifiers: { ctrl: false, shift: false, alt: false, meta: false, ...modifiers },
});

test('text-only nested modals dismiss through raw and enhanced Escape and restore focus', async () => {
  const app = defineTui({
    id: 'empty-dialogs',
    init: () => ({ state: 0 }),
    update: (_state, message) => ({ state: message }),
    view: (state) => overlay([
      button({ id: 'open', label: 'Open', onPress: () => 2 }),
      ...(state === 0 ? [] : [dialog({
        id: 'outer', title: 'Loading', modal: true,
        focusPolicy: { returnFocus: 'restore' },
        dismissal: { dismissOnEscape: true, dismissOnOutsidePress: false },
        onDismiss: () => 0,
        slots: { content: state === 2 ? dialog({
          id: 'inner', title: 'Error', modal: true,
          focusPolicy: { returnFocus: 'restore' },
          dismissal: { dismissOnEscape: true, dismissOnOutsidePress: false },
          onDismiss: () => 1,
          slots: { content: viewport(text({ content: 'No actions' }), { offset: { row: 0 } }) },
        }) : text({ content: 'Loading' }) },
      })]),
    ]),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(),
    input: { keyboard: kittyKeyboardProfile(3) } });
  try {
    await runtime.start();
    await runtime.handleInput(key('enter'));
    assert.equal(runtime.state(), 2);
    await runtime.handleInput(key('enter'));
    assert.equal(runtime.state(), 2, 'obscured button must not receive input');
    await runtime.handleInputChunk({ data: '\u001b' });
    await runtime.flushInput();
    assert.equal(runtime.state(), 1);
    await runtime.handleInputChunk({ data: '\u001b[27u' });
    assert.equal(runtime.state(), 0);
    assert.equal(runtime.frame().focusPath.at(-1), 'open');
  } finally { await runtime.dispose(); }
});

test('read-only text areas use document boundaries and viewport-sized wrapped pages', async () => {
  const source = 'abcdefghij'.repeat(12);
  const app = defineTui({
    id: 'paging',
    init: () => ({ state: createTextAreaState({ value: source }) }),
    update: (state, transition) => ({ state: textAreaReducer(state, transition).state }),
    view: (state) => textArea({
      id: 'document', meta: { accessibleName: 'Document' }, state,
      wrap: true, readOnly: true, onTransition: (transition) => transition,
    }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 3 } }) });
  try {
    await runtime.start();
    await runtime.handleInput(key('pageDown', { shift: true }));
    assert.equal(runtime.state().caret.position.offset, 30);
    assert.equal(runtime.state().selection.anchor.offset, 0);
    assert.equal(runtime.state().selection.focus.offset, 30);
    await runtime.handleInputChunk({ data: '\u001b[1;6F' });
    assert.equal(runtime.state().caret.position.offset, source.length);
    assert.equal(runtime.state().selection.anchor.offset, 0);
    await runtime.handleInputChunk({ data: '\u001b[1;5H' });
    assert.equal(runtime.state().caret.position.offset, 0);
    assert.equal(runtime.state().selection, undefined);
    await runtime.handleInput(key('end'));
    assert.equal(runtime.state().caret.position.offset, source.length, 'End remains the logical line end');
    await runtime.handleInput(key('home', { ctrl: true, shift: true }));
    assert.equal(runtime.state().selection.anchor.offset, source.length);
    assert.equal(runtime.state().selection.focus.offset, 0);
    assert.equal(textDocumentLength(runtime.state().document), source.length);
  } finally { await runtime.dispose(); }
});

test('inconclusive tmux probes retain evidence and explicit rejections override it', () => {
  const input = {
    host: { runtime: 'node', inputIsTty: true, outputIsTty: true, supportsRawInput: true,
      supportsResizeEvents: true, supportsTerminalProtocols: true },
    environment: { variables: { TERM: 'tmux-256color' } },
  };
  for (const name of ['alternateScreen', 'cursorVisibility', 'mouseReporting']) {
    assert.equal(resolveTerminalCapabilities(input)[name].support, 'supported');
    assert.equal(resolveTerminalCapabilities({ ...input, probes: { [name]: 'unknown' } })[name].support, 'supported');
    assert.equal(resolveTerminalCapabilities({ ...input, probes: { [name]: 'unsupported' } })[name].support, 'unsupported');
  }
});

test('Meta-as-Escape is probed, owned by nested sessions, and restored to observed state', async () => {
  const host = createMemoryTerminalHost();
  host.input('\u001b[?1036;2$y\u001b[?1;2c');
  const capabilities = await host.getCapabilities({ activeProbes: ['terminalModes'] });
  assert.equal(capabilities.metaSendsEscape.support, 'supported');
  const outer = await host.beginSession();
  assert.equal(outer.initialState.metaSendsEscape, false);
  assert.equal(outer.initialState.provenance.metaSendsEscape, 'observed');
  assert.equal((await outer.enableMetaSendsEscape()).status, 'applied');
  const inner = await host.beginSession();
  await inner.enableMetaSendsEscape();
  await inner.restore();
  assert.equal((await outer.currentState()).metaSendsEscape, true);
  await outer.restore();
  assert.match(host.output(), /\u001b\[\?1036h/u);
  assert.match(host.output(), /\u001b\[\?1036l/u);
  await host.dispose();
});

test('retained measurements survive sibling updates and invalidate on constraints and profiles', () => {
  let calls = 0;
  const entry = componentElement({ definition: {
    ...leafComponentDefinition,
    identity: 'optional',
    measure: ({ constraints }) => {
      calls += 1;
      return { minWidth: 0, minHeight: 0, preferredWidth: 40, preferredHeight: Math.ceil(40 / constraints.width) };
    },
    render: () => {},
    accessibility: ({ id }) => ({ id, role: 'text' }),
  } });
  const make = (sibling) => column([
    measuredViewport([entry], { id: 'retained-viewport', onScroll: () => 'scroll', scrollbar: { axis: 'vertical', visible: 'always' } }),
    text({ content: sibling }),
  ], { sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }] });
  const size = { columns: 20, rows: 5 };
  renderElementFrame(make('initial'), size);
  const startup = calls;
  for (let i = 0; i < 10; i += 1) renderElementFrame(make(String(i)), size);
  assert.equal(calls, startup);
  renderElementFrame(make('resize'), { columns: 10, rows: 5 });
  assert.ok(calls > startup);
  const resized = calls;
  renderElementFrame(make('profile'), size, { widthProfile: defineTextWidthProfile({ emoji: 'wide', ambiguous: 'wide' }) });
  assert.ok(calls > resized);
  const profiled = calls;
  renderElementFrame(make('theme'), size, { theme: { ...defaultTheme, name: 'changed-theme' } });
  assert.ok(calls > profiled);
});

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
