import {
  commandInputReducer,
  commandInputPresentation,
  createSplitPaneState,
  createScrollState,
  scrollReducer,
  splitPanePresentation,
  splitPaneReducer
} from '@ismail-elkorchi/terminal-ui/behavior';
import {
  button,
  commandInput,
  table,
  text,
  tree,
  type CommandInputAction,
  type Element,
  type TableAction,
  type TreeAction
} from '@ismail-elkorchi/terminal-ui/components';
import { column, splitPane, surface } from '@ismail-elkorchi/terminal-ui/layout';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import { defineTui } from '@ismail-elkorchi/terminal-ui/tui';
import { createTerminalHost, ok } from '@ismail-elkorchi/terminal-ui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createInputDecoder } from '@ismail-elkorchi/terminal-ui/input';
import { resolveSelectedText } from '@ismail-elkorchi/terminal-ui/interaction';
import { createProtocolWriter } from '@ismail-elkorchi/terminal-ui/protocol';
import { measureTextCells } from '@ismail-elkorchi/terminal-ui/text';
import { defaultTheme, resolveThemeColor } from '@ismail-elkorchi/terminal-ui/theme';
import { confirm, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';
import { toAccessibleSnapshot, validateAccessibleSnapshot } from '@ismail-elkorchi/terminal-ui/accessibility';
import { createTranscriptRecorder, validateTranscript } from '@ismail-elkorchi/terminal-ui/transcript';
import { createTerminalHarness } from '@ismail-elkorchi/terminal-ui/testing';
import { schemaArtifacts } from '@ismail-elkorchi/terminal-ui/schemas';

type Message =
  | { readonly kind: 'increment' }
  | { readonly kind: 'selectRow'; readonly action: TableAction }
  | { readonly kind: 'tree'; readonly action: TreeAction }
  | { readonly kind: 'command'; readonly action: CommandInputAction }
  | { readonly kind: 'submit' };

interface State {
  readonly count: number;
}

function view(state: State): Element<Message> {
  const increment: Element<{ readonly kind: 'increment' }> = button({
    id: 'increment',
    label: 'Increment',
    onPress: () => ({ kind: 'increment' }) as const
  });
  const processes: Element<{ readonly kind: 'selectRow'; readonly action: TableAction }> = table({
    getRowId: (row) => String(row.id),
    id: 'processes',
    rows: [{ id: 7, name: 'worker' }],
    columns: [
      { id: 'id', header: 'ID', value: (row) => row.id },
      { id: 'name', header: 'Name', value: (row) => row.name }
    ],
    onAction: (action) => ({ kind: 'selectRow' as const, action })
  });
  const files: Element<{ readonly kind: 'tree'; readonly action: TreeAction }> = tree({
    id: 'files',
    nodes: [{ id: 'src', label: 'src', kind: 'leaf' }],
    onAction: (action) => ({ kind: 'tree' as const, action })
  });
  const commands: Element<
    | { readonly kind: 'command'; readonly action: CommandInputAction }
    | { readonly kind: 'submit' }
  > = commandInput({
    id: 'commands',
    presentation: commandInputPresentation({ input: { text: '', cursor: 0 }, history: [], suggestions: [] }),
    onAction: (action) => ({ kind: 'command' as const, action }),
    onSubmit: () => ({ kind: 'submit' as const })
  });
  const content: Element<Message> = column([
    text(`Count: ${String(state.count)}`, { id: 'count', textRole: 'metric' }),
    increment,
    processes,
    files,
    commands
  ], {
    id: 'content',
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 2 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 }
    ]
  });
  return surface(content, { id: 'root', variant: 'raised' });
}

const app = defineTui<State, Message>({
  id: 'packed-consumer',
  init: () => ({ count: 1 }),
  update: (state, message) => message.kind === 'increment'
    ? { state: { count: state.count + 1 } }
    : { state },
  view
});

const scroll = scrollReducer(createScrollState({
  contentRows: 20,
  viewportRows: 5
}), { kind: 'scrollLines', rows: 2 });
const command = commandInputReducer({
  input: { text: '', cursor: 0 },
  history: [],
  suggestions: []
}, { kind: 'edit', operation: { kind: 'insert', text: 'open' } });
const split = splitPaneReducer(createSplitPaneState(2), {
  kind: 'resizeBy',
  deltaShare: 0.1
});
const panes = splitPane([text('Left'), text('Right')], {
  id: 'consumer-panes',
  direction: 'horizontal',
  ...splitPanePresentation(split),
  onAction: (action) => ({ kind: 'split' as const, action })
});
const output = renderFramePlain(renderElementFrame(view({ count: 1 }), {
  columns: 40,
  rows: 8
}));
const rootHost = createTerminalHost({ runtime: 'memory' });
const memoryHost = createMemoryTerminalHost();
await memoryHost.write({ text: 'ordered output' });
await memoryHost.flush();
const decoded = createInputDecoder().decode({ data: '\r' });
const selected = resolveSelectedText({
  sources: [{ id: 'consumer-source', text: 'selected text', selection: { start: 0, end: 8 } }]
});
const harness = createTerminalHarness({ viewport: { columns: 20, rows: 4 } });
const result = ok('root-entrypoint');
const protocolWrites: string[] = [];
const protocol = createProtocolWriter({
  write: (value) => {
    protocolWrites.push(value);
    return Promise.resolve();
  }
});
await protocol.enableBracketedPaste();
const promptResult = await runPrompt(confirm({
  label: 'Continue?',
  nonTty: { mode: 'provided_value', value: true }
}));
const accessible = toAccessibleSnapshot({
  source: 'widget',
  root: { id: 'consumer', role: 'application', label: 'Consumer' }
});
const transcript = createTranscriptRecorder({ id: 'consumer', source: 'test' }).snapshot();

if (app.id !== 'packed-consumer') throw new Error('The TUI entrypoint did not create the app.');
if (rootHost.runtime !== 'memory' || !result.ok || result.value !== 'root-entrypoint') {
  throw new Error('The root entrypoint did not expose its documented runtime contracts.');
}
if (memoryHost.output() !== 'ordered output') throw new Error('The host entrypoint did not flush output.');
if (decoded.events[0]?.kind !== 'key' || decoded.events[0].key !== 'enter') {
  throw new Error('The input entrypoint did not decode terminal input.');
}
if (!selected.ok || selected.text !== 'selected') {
  throw new Error('The interaction entrypoint did not resolve controlled selection.');
}
if (harness.host.runtime !== 'memory') throw new Error('The testing entrypoint did not create a harness.');
if (scroll.offsetRow !== 2) throw new Error('The behavior entrypoint did not update controlled state.');
if (command.input.text !== 'open') throw new Error('The behavior entrypoint did not update command state.');
if (!renderFramePlain(renderElementFrame(panes, { columns: 20, rows: 2 })).includes('Left')) {
  throw new Error('The packed layout and behavior entrypoints did not render a controlled split pane.');
}
if (!output.includes('Count: 1') || !output.includes('Increment')) {
  throw new Error(`The packed renderer output was incomplete: ${JSON.stringify(output)}`);
}
if (measureTextCells('A界').cells !== 3 || resolveThemeColor(defaultTheme, 'accent.primary') === undefined) {
  throw new Error('The packed text or theme entrypoint failed.');
}
if (protocolWrites[0] !== '\u001B[?2004h' || promptResult.status !== 'submitted') {
  throw new Error('The packed protocol or prompt entrypoint failed.');
}
if (!validateAccessibleSnapshot(accessible).ok || !validateTranscript(transcript).ok) {
  throw new Error('The packed accessibility or transcript entrypoint failed.');
}
if (schemaArtifacts.length < 7) throw new Error('The packed schema catalog is incomplete.');

console.log('terminal-ui packed consumer passed');
