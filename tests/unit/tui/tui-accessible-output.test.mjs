import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccessibleSnapshot } from '../../../dist/accessibility/index.js';
import { button, field, passwordInput, textInput } from '../../../dist/components/index.js';
import { createMemoryTerminalHost, failedTerminalWrite, indeterminateTerminalWrite } from '../../../dist/host/index.js';
import { column } from '../../../dist/layout/index.js';
import { renderAccessibleSnapshot } from '../../../dist/renderer/index.js';
import { createTranscriptRecorder } from '../../../dist/transcript/index.js';
import { createTuiRuntime, defineTui, runTui, TuiRunError } from '../../../dist/tui/index.js';
import { accessibleFrameOutput } from '../../../dist/tui/commit/accessible-output.js';
import { tuiRuntimeRunner } from '../../../dist/tui/runtime.js';
import { textInputReducer } from '../../../dist/behavior/index.js';
import { key } from '../../support/keyboard.mjs';
import { waitUntil } from '../../support/async.ts';

const snapshot = (children) => createAccessibleSnapshot({ source: 'tui', root: { id: 'app', role: 'group', children } });
const editApp = () => defineTui({
  id: 'accessible-edit',
  init: () => ({ state: { text: '', cursor: 0 } }),
  update: (state, message) => message.kind === 'quit' ? { state, exit: {} } : { state: textInputReducer(state, message) },
  view: (state) => textInput({ id: 'entry', meta: { accessibleName: 'Name' }, state, onTransition: (transition) => transition }),
  inputBindings: [{ id: 'quit', triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }], message: { kind: 'quit' } }],
});
const insert = (text) => ({ kind: 'edit', operation: { kind: 'insert', text } });

test('semantic text resolves relationships and includes editing, validation and numeric context safely', () => {
  const result = renderAccessibleSnapshot(snapshot([
    { id: 'label', role: 'text', value: 'Account\u001b[2J' },
    { id: 'help', role: 'text', value: 'Use a work name' },
    { id: 'error', role: 'text', value: 'Name required' },
    { id: 'entry', role: 'textbox', labelledBy: 'label', describedBy: ['help'], errorMessage: 'error',
      value: 'ab', focused: true, required: true, invalid: true, readOnly: true, busy: true,
      textPosition: { caretOffset: 2, selection: { startOffset: 0, endOffsetExclusive: 2 } } },
    { id: 'list', role: 'listbox', label: 'Items', activeDescendant: 'item', children: [
      { id: 'item', role: 'option', label: 'Urgent', selected: true, position: { positionInSet: 2, setSize: 3 } },
    ] },
    { id: 'slider', role: 'slider', label: 'Volume', numericValue: { minimum: 10, current: 15, maximum: 20 } },
  ]));
  for (const pattern of [/required/u, /invalid:true/u, /read-only/u, /busy/u, /caret:2/u, /selection:0-2/u,
    /labelled-by:label \(Account\)/u, /described-by:help \(Use a work name\)/u,
    /error:error \(Name required\)/u, /active-descendant:item \(Urgent; position:2\/3; selected\)/u, /minimum:10/u]) {
    assert.match(result, pattern);
  }
  assert.doesNotMatch(result, /\u001b/u);
});

test('background text, off live regions and list reorders stay quiet; live and control changes are meaningful', () => {
  const make = (tick, active = 'a', checked = false) => snapshot([
    { id: 'ticker', role: 'text', value: String(tick) },
    { id: 'off', role: 'status', live: 'off', value: String(tick) },
    { id: 'list', role: 'listbox', label: 'Items', focused: true, activeDescendant: active, children: [
      { id: 'a', role: 'option', label: 'Alpha', selected: active === 'a', position: { positionInSet: 1, setSize: 2 } },
      { id: 'b', role: 'option', label: 'Beta', selected: active === 'b', position: { positionInSet: 2, setSize: 2 } },
    ] },
    { id: 'check', role: 'checkbox', label: 'Notify', checked },
  ]);
  assert.equal(accessibleFrameOutput(make(1), make(2)), '');
  const changed = accessibleFrameOutput(make(2), make(3, 'b', true));
  assert.match(changed, /active-descendant:b \(Beta; position:2\/2; selected\)/u);
  assert.match(changed, /Notify \[checked:true\]/u);
  assert.doesNotMatch(changed, /ticker|status|= 3/u);
  const list = (ids) => snapshot([{ id: 'list', role: 'listbox', label: 'Items', children: ids.map((id, index) => ({
    id, role: 'option', label: id, selected: false, position: { positionInSet: index + 1, setSize: ids.length },
  })) }]);
  assert.equal(accessibleFrameOutput(list(['a', 'b']), list(['b', 'a'])), '');
  const live = (value) => snapshot([{ id: 'live', role: 'group', live: 'polite', children: [{ id: 'notice', role: 'text', value }] }]);
  assert.match(accessibleFrameOutput(live('waiting'), live('ready')), /ready/u);
});

test('accessible writes commit with state, omit intermediate batches and deduplicate redraws', async () => {
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app: editApp(), host, outputMode: 'accessible' });
  try {
    await runtime.start();
    const initial = host.output();
    await runtime.redraw();
    assert.equal(host.output(), initial);
    await runtime.dispatchMany([insert('a'), insert('b')]);
    assert.match(host.output().slice(initial.length), /Name = ab/u);
    assert.doesNotMatch(host.output().slice(initial.length), /Name = a \[/u);
    const before = host.output();
    const frame = runtime.frame();
    await runtime.handleInput(key('l', { ctrl: true }));
    assert.equal(runtime.frame(), frame);
    assert.match(host.output().slice(before.length), /^Context:\r\n/u);
    const beforeChunk = host.output();
    await runtime.handleInputChunk({ data: '\u000c' });
    assert.match(host.output().slice(beforeChunk.length), /^Context:\r\n/u);
    assert.doesNotMatch(host.output(), /\u001b/u);
  } finally { await runtime.dispose(); }
});

for (const receipt of [failedTerminalWrite, indeterminateTerminalWrite]) {
  test(`${receipt.name} never accepts or remembers an uncommitted announcement`, async () => {
    const host = createMemoryTerminalHost();
    const runtime = createTuiRuntime({ app: editApp(), host, outputMode: 'accessible' });
    try {
      await runtime.start();
      const initial = host.output();
      const frame = runtime.frame();
      const write = host.write.bind(host);
      host.write = async () => receipt('test', new Error('injected'));
      await assert.rejects(runtime.dispatch(insert('not committed')));
      assert.equal(runtime.state().text, '');
      assert.equal(runtime.frame(), frame);
      assert.equal(host.output(), initial);
      host.write = write;
      await runtime.repeatAccessibleContext();
      assert.doesNotMatch(host.output(), /not committed/u);
      await runtime.dispatch(insert('accepted'));
      assert.match(host.output(), /Name = accepted/u);
    } finally { await runtime.dispose(); }
  });
}

test('blocked write leaves repeats serialized behind the accepted commit', async () => {
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app: editApp(), host, outputMode: 'accessible' });
  await runtime.start();
  const write = host.write.bind(host);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let began;
  const writing = new Promise((resolve) => { began = resolve; });
  host.write = async (...args) => { began(); await blocked; return write(...args); };
  try {
    const pending = runtime.dispatch(insert('committed later'));
    await writing;
    assert.equal(runtime.state().text, '');
    const repeat = runtime.repeatAccessibleContext();
    release();
    await pending;
    await repeat;
    assert.match(host.output(), /Context:\r\n# Name\r\n- textbox: Name = committed later/u);
  } finally { release(); await runtime.dispose(); }
});

test('suspended output emits no announcements until reacquisition repeats current context', async () => {
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app: editApp(), host, outputMode: 'accessible' });
  try {
    await runtime.start();
    const before = host.output();
    const runner = tuiRuntimeRunner(runtime);
    await runner.suspendOutput();
    await runtime.dispatch(insert('while suspended'));
    assert.equal(host.output(), before);
    await assert.rejects(runtime.repeatAccessibleContext(), /suspended/u);
    await runner.resumeOutput();
    await runtime.redraw();
    assert.match(host.output().slice(before.length), /Name = while suspended/u);
  } finally { await runtime.dispose(); }
});

test('password input and its relationships never expose source text or edit positions', async () => {
  const host = createMemoryTerminalHost();
  const transcript = createTranscriptRecorder({ id: 'secret', source: 'tui' });
  const app = defineTui({
    init: () => ({ state: { text: '', cursor: 0 } }),
    update: (state, message) => ({ state: textInputReducer(state, message) }),
    view: (state) => column([
      field({ id: 'secret-field', label: 'Password', description: 'Private entry', control: passwordInput({ id: 'secret', state, onTransition: (message) => message }) }),
      button({ id: 'done', label: 'Done', onPress: () => insert('') }),
    ]),
  });
  const runtime = createTuiRuntime({ app, host, transcript, outputMode: 'accessible' });
  try {
    await runtime.start();
    const before = host.output();
    await runtime.handleInput({ kind: 'text', text: 'swordfish👩‍💻', paste: false });
    await runtime.handleInput(key('arrowLeft', { shift: true }));
    assert.equal(host.output(), before);
    await runtime.repeatAccessibleContext();
    assert.doesNotMatch(host.output(), /swordfish|caret:|selection:/u);
    assert.doesNotMatch(JSON.stringify(transcript.snapshot()), /swordfish/u);
  } finally { await runtime.dispose(); }
});

test('accessible mode preserves main-screen scrollback and restores sessions on completion and failure', async () => {
  for (const fail of [false, true]) {
    const host = createMemoryTerminalHost();
    host.input('hello\u0011');
    if (fail) {
      const write = host.write.bind(host);
      host.write = async (chunk, context) => chunk.text.includes('Accessible terminal output')
        ? failedTerminalWrite('test', new Error('injected')) : write(chunk, context);
    }
    const result = runTui(editApp(), { host, outputMode: 'accessible' });
    if (fail) await assert.rejects(result, TuiRunError);
    else assert.equal((await result).status, 'completed');
    assert.equal(host.stdin.isRawModeEnabled(), false);
    assert.equal(host.restores().length, 1);
    assert.doesNotMatch(host.output(), /\u001b\[\?1049h|\u001b\[\?25l|\u001b\[\d*;?\d*H/u);
  }
});

test('output configuration rejects invalid modes and incompatible graphics before terminal mutation', async () => {
  const host = createMemoryTerminalHost();
  assert.throws(() => createTuiRuntime({ app: editApp(), host, outputMode: 'other' }), /outputMode/u);
  assert.throws(() => createTuiRuntime({ app: editApp(), host, outputMode: 'accessible', graphics: 'kitty' }), /graphics/u);
  await assert.rejects(runTui(editApp(), { host, outputMode: 'other' }), TuiRunError);
  assert.equal(host.output(), '');
  const visual = createTuiRuntime({ app: editApp(), host });
  try { await visual.start(); await assert.rejects(visual.repeatAccessibleContext(), /accessible output mode/u); }
  finally { await visual.dispose(); }
});

test('long value edits announce an explicit bounded excerpt with the committed caret and selection', () => {
  const value = 'a'.repeat(1500) + '👩‍💻' + 'b'.repeat(1500);
  const previous = snapshot([{ id: 'body', role: 'textbox', label: 'Body', focused: true, value,
    textPosition: { caretOffset: 1400 } }]);
  const next = snapshot([{ id: 'body', role: 'textbox', label: 'Body', focused: true, value: `${value}!`,
    textPosition: { caretOffset: 1505, selection: { startOffset: 1500, endOffsetExclusive: 1505 } } }]);
  const change = accessibleFrameOutput(previous, next);
  assert.ok(change.length < 500);
  assert.match(change, /value excerpt:/u);
  assert.match(change, /caret:1505, selection:1500-1505/u);
  assert.match(renderAccessibleSnapshot(next), /a{1500}/u);
});

test('changed errors are read even when validation was already invalid and focus is elsewhere', () => {
  const make = (value) => snapshot([
    { id: 'input', role: 'textbox', label: 'Address', invalid: true, errorMessage: 'error' },
    { id: 'error', role: 'text', value },
    { id: 'retry', role: 'button', label: 'Retry', focused: true },
  ]);
  const change = accessibleFrameOutput(make('Missing address'), make('Address unavailable'));
  assert.match(change, /Address unavailable/u);
  assert.equal(change.match(/Address unavailable/gu).length, 1);
});

test('nested live-off content does not trigger its polite ancestor', () => {
  const make = (value) => snapshot([{ id: 'live', role: 'group', live: 'polite', children: [
    { id: 'off', role: 'status', live: 'off', value },
  ] }]);
  assert.equal(accessibleFrameOutput(make('one'), make('two')), '');
});

test('an aborted in-flight write never publishes candidate state or announces it after disposal', async () => {
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app: editApp(), host, outputMode: 'accessible' });
  await runtime.start();
  const output = host.output();
  const frame = runtime.frame();
  let began;
  const writing = new Promise((resolve) => { began = resolve; });
  host.write = async (_chunk, { signal }) => {
    began();
    return new Promise((resolve) => {
      const abort = () => resolve(failedTerminalWrite('test', new Error('cancelled')));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
  };
  const transition = runtime.dispatch(insert('cancelled candidate'));
  const rejected = assert.rejects(transition);
  await writing;
  await runtime.dispose();
  await rejected;
  assert.equal(runtime.state().text, '');
  assert.equal(runtime.frame(), frame);
  assert.equal(host.output(), output);
});

test('application Ctrl+L bindings take precedence over repeat context', async () => {
  const app = defineTui({
    init: () => ({ state: 0 }), update: (state) => ({ state: state + 1 }),
    view: () => button({ id: 'button', label: 'Action', onPress: () => 'act' }),
    inputBindings: [{ id: 'custom-repeat-key', triggers: [{ kind: 'key', key: 'l', modifiers: { ctrl: true } }], message: 'act' }],
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host, outputMode: 'accessible' });
  try {
    await runtime.start();
    const before = host.output();
    await runtime.handleInput(key('l', { ctrl: true }));
    assert.equal(runtime.state(), 1);
    assert.equal(host.output(), before);
  } finally { await runtime.dispose(); }
});

test('cleared busy, read-only and disabled states are explicit', () => {
  const before = snapshot([{ id: 'field', role: 'textbox', label: 'Name', busy: true, readOnly: true, disabled: true, required: true }]);
  const after = snapshot([{ id: 'field', role: 'textbox', label: 'Name' }]);
  assert.match(accessibleFrameOutput(before, after), /Changed \(enabled, editable, ready, optional\)/u);
});

test('an OS interruption restores the accessible terminal session', async () => {
  const host = createMemoryTerminalHost();
  const run = runTui(editApp(), { host, outputMode: 'accessible' });
  await waitUntil(() => host.output().includes('Accessible terminal output'));
  host.signals.emit('SIGTERM');
  const exit = await run;
  assert.equal(exit.status, 'interrupted');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().length, 1);
  assert.doesNotMatch(host.output(), /\u001b\[\?1049h|\u001b\[\?25l/u);
});

test('same-focused typing reports only changed fields while validation, focus entry and repeat keep their context', async () => {
  const host = createMemoryTerminalHost();
  const app = defineTui({
    init: () => ({ state: { editor: { text: '', cursor: 0 }, error: '' } }),
    update: (state, message) => ({ state: message === 'validate'
      ? { ...state, error: 'Choose a longer title' }
      : { editor: textInputReducer(state.editor, message), error: '' } }),
    view: (state) => column([
      field({ id: 'title-field', label: 'Task title', description: 'Shown in your task list', control: textInput({
        id: 'title', state: state.editor, required: true,
        ...(state.error === '' ? {} : { error: state.error }),
        onTransition: (transition) => transition,
      }) }),
      button({ id: 'validate', label: 'Validate', onPress: () => 'validate' }),
    ]),
  });
  const runtime = createTuiRuntime({ app, host, outputMode: 'accessible' });
  const delta = async (operation) => {
    const offset = host.output().length;
    await operation();
    return host.output().slice(offset);
  };
  try {
    await runtime.start();
    assert.match(host.output(), /required, labelled-by:title-field:label \(Task title\), described-by:title-field:description \(Shown in your task list\)/u);
    assert.equal(await delta(() => runtime.dispatch(insert('t'))), 'Changed: textbox: Task title = t [caret:1]\r\n');
    assert.equal(await delta(() => runtime.dispatch(insert('e'))), 'Changed: textbox: Task title = te [caret:2]\r\n');
    assert.equal(await delta(() => runtime.handleInput(key('arrowLeft', { shift: true }))),
      'Changed: textbox: Task title [caret:1, selection:1-2]\r\n');
    assert.equal(await delta(() => runtime.handleInput(key('arrowRight'))),
      'Changed: textbox: Task title [caret:2, selection:cleared]\r\n');
    const invalid = await delta(() => runtime.dispatch('validate'));
    assert.match(invalid, /invalid:true, error:title:error \(Choose a longer title\)/u);
    assert.doesNotMatch(invalid, /labelled-by:|described-by:|focused|caret:| = te/u);
    const valid = await delta(() => runtime.dispatch(insert('st')));
    assert.match(valid, /Validation cleared: textbox: Task title = test \[caret:4, error:cleared\]/u);
    assert.doesNotMatch(valid, /labelled-by:|described-by:|focused/u);
    assert.equal(await delta(() => runtime.dispatch(insert('!'))), 'Changed: textbox: Task title = test! [caret:5]\r\n');
    const repeated = await delta(() => runtime.repeatAccessibleContext());
    assert.match(repeated, /required, labelled-by:title-field:label \(Task title\), described-by:title-field:description \(Shown in your task list\)/u);
    assert.match(repeated, /Task title = test! \[focused/u);
    await runtime.handleInput(key('tab'));
    const returned = await delta(() => runtime.handleInput(key('tab', { shift: true })));
    assert.match(returned, /Focus: textbox: Task title = test! \[focused, required, labelled-by:/u);
    assert.match(returned, /described-by:title-field:description/u);
  } finally { await runtime.dispose(); }
});

test('same-focus deltas resolve changed relationship targets and report removed relationships', () => {
  const make = ({ label = 'Name', description = 'Old help', describedBy = ['help'], error = 'Old error' } = {}) => snapshot([
    { id: 'label', role: 'text', value: label },
    { id: 'help', role: 'text', value: description },
    { id: 'error', role: 'text', value: error },
    { id: 'entry', role: 'textbox', labelledBy: 'label', ...(describedBy.length === 0 ? {} : { describedBy }), errorMessage: 'error',
      description: 'Static explanation', focused: true, required: true, invalid: true, value: 'a', textPosition: { caretOffset: 1 } },
  ]);
  const first = make();
  const changedHelp = make({ description: 'New help\u001b[2J' });
  assert.equal(accessibleFrameOutput(first, changedHelp),
    'Changed: textbox: Name [described-by:help (New help)]\n');
  assert.equal(accessibleFrameOutput(changedHelp, make({ description: 'New help', label: 'Display name' })),
    'Changed: textbox: Display name [labelled-by:label (Display name)]\n');
  assert.equal(accessibleFrameOutput(first, make({ error: 'New error' })),
    'Changed: textbox: Name [error:error (New error)]\n');
  assert.equal(accessibleFrameOutput(first, make({ describedBy: [] })),
    'Changed: textbox: Name [described-by:help removed]\n');
});

test('caret-only changes in a long focused value do not repeat the value or excerpt', () => {
  const make = (caretOffset) => snapshot([{ id: 'body', role: 'textbox', label: 'Body', focused: true,
    value: 'a'.repeat(3000), required: true, description: 'Long document', textPosition: { caretOffset } }]);
  assert.equal(accessibleFrameOutput(make(1400), make(1401)), 'Changed: textbox: Body [caret:1401]\n');
});

test('same-focus state clearing is explicit without repeating unchanged flags or edit context', () => {
  const flags = { disabled: true, readOnly: true, busy: true, required: true };
  const make = (state) => snapshot([{ id: 'field', role: 'textbox', label: 'Name', focused: true,
    value: 'same', textPosition: { caretOffset: 4 }, description: 'Static explanation', ...state }]);
  const before = make(flags);
  for (const [field, opposite] of [['disabled', 'enabled'], ['readOnly', 'editable'], ['busy', 'ready'], ['required', 'optional']]) {
    assert.equal(accessibleFrameOutput(before, make({ ...flags, [field]: false })),
      `Changed (${opposite}): textbox: Name\n`);
  }
  const cleared = { disabled: false, readOnly: false, busy: false, required: false };
  for (const next of [make(cleared), make({})]) {
    assert.equal(accessibleFrameOutput(before, next), 'Changed (enabled, editable, ready, optional): textbox: Name\n');
  }
  assert.equal(accessibleFrameOutput(make({ ...flags, invalid: true }), make({ ...cleared, invalid: false })),
    'Validation cleared (enabled, editable, ready, optional): textbox: Name\n');
});
