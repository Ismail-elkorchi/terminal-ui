import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  column,
  commandInput,
  defineTui,
  createTuiControls,
  createTuiChild,
  createTuiCommands,
  liftTuiResult,
  dialog,
  grid,
  helpBar,
  menuBar,
  createCommandSuggestions,
  overlay,
  runTui,
  splitPane,
  statusBar,
  surface,
  tabs,
  text,
} from '@ismail-elkorchi/terminal-ui';
import type {
  CommandInputTransition,
  Element,
  MenuBarTransition,
  MenuItem,
  TabCloseEvent,
  TabsTransition,
  TreeNode,
  ScrollableTreeState,
  TuiContext,
  TuiControlMessage,
  TuiChildState,
  TuiChildMessage,
} from '@ismail-elkorchi/terminal-ui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import {
  commandInputView,
  createCommandInputState,
  commandInputReducer,
  createScrollState,
  menuBarView,
  menuBarReducer,
  tabsReducer,
  createTreeSource,
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { CommandInputState, MenuBarState } from '@ismail-elkorchi/terminal-ui/behavior';
import { editorPanelDefinition } from './features/editor-panel.ts';
import type { EditorPanelState, EditorPanelMessage } from './features/editor-panel.ts';
import { explorerDefinition } from './features/explorer.ts';
import type { ExplorerState, ExplorerMessage } from './features/explorer.ts';
import { createTuiRuntime } from '@ismail-elkorchi/terminal-ui/tui';
import type { TuiEffect, TuiRuntime, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui/tui';
import { textDocumentBytes, textDocumentText } from '@ismail-elkorchi/terminal-ui/text';
import type { TextDocument } from '@ismail-elkorchi/terminal-ui/text';

type EntryMetadata = Readonly<{
  path: string;
  entryKind: 'file' | 'directory';
}>;

interface EditorBuffer {
  readonly path: string;
  readonly label: string;
  readonly editor: TuiChildState<EditorPanelState>;
  readonly savedDocument: TextDocument;
}

type OpenMode = 'file' | 'folder';

type EditorOpenResult =
  | { readonly kind: 'file'; readonly path: string; readonly content: string }
  | {
      readonly kind: 'folder';
      readonly root: string;
      readonly nodes: readonly TreeNode<EntryMetadata>[];
    };

export interface IdeEditorOperations {
  open(mode: OpenMode, targetPath: string, signal: AbortSignal): Promise<EditorOpenResult>;
  save(targetPath: string, content: string, signal: AbortSignal): Promise<void>;
}

type EditorOperation =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly operation: 'open'; readonly requestId: string; readonly label: string }
  | {
      readonly kind: 'pending';
      readonly operation: 'save';
      readonly requestId: string;
      readonly label: string;
      readonly path: string;
      readonly document: TextDocument;
    }
  | { readonly kind: 'failed'; readonly requestId: string; readonly message: string };

interface ChooserState {
  readonly mode: OpenMode;
  readonly command: CommandInputState;
}

interface EditorState {
  readonly root?: string;
  readonly nodes: readonly TreeNode<EntryMetadata>[];
  readonly explorer: TuiChildState<ExplorerState<EntryMetadata>>;
  readonly buffers: readonly EditorBuffer[];
  readonly activePath?: string;
  readonly menu: MenuBarState;
  readonly command: CommandInputState;
  readonly chooser?: ChooserState;
  readonly operation: EditorOperation;
  readonly notice: string;
  readonly nextOperation: number;
}

type EditorMessage =
  | TuiControlMessage<typeof editorControls>
  | { readonly kind: 'menuActivate'; readonly id: string }
  | { readonly kind: 'explorer'; readonly message: TuiChildMessage<ExplorerMessage<EntryMetadata>> }
  | { readonly kind: 'closeTab'; readonly event: TabCloseEvent }
  | { readonly kind: 'edit'; readonly message: TuiChildMessage<EditorPanelMessage> }
  | { readonly kind: 'submitCommand'; readonly value: string }
  | { readonly kind: 'showChooser'; readonly mode: OpenMode }
  | { readonly kind: 'submitChooser'; readonly value: string }
  | { readonly kind: 'dismissChooser' }
  | { readonly kind: 'requestOpen'; readonly mode: OpenMode; readonly path: string }
  | { readonly kind: 'workspaceLoaded'; readonly requestId: string; readonly root: string; readonly nodes: readonly TreeNode<EntryMetadata>[] }
  | { readonly kind: 'fileLoaded'; readonly requestId: string; readonly path: string; readonly content: string }
  | { readonly kind: 'fileSaved'; readonly requestId: string; readonly path: string }
  | { readonly kind: 'operationFailed'; readonly requestId: string; readonly message: string }
  | { readonly kind: 'saveActive' }
  | { readonly kind: 'closeActive' }
  | { readonly kind: 'exit' };

const editorCommands = createTuiCommands<EditorState, EditorMessage, EditorMessage>([
  { id: 'open-file', label: 'Open File', shortcuts: [{ kind: 'key', key: 'o', modifiers: { ctrl: true } }], message: { kind: 'showChooser', mode: 'file' } },
  { id: 'open-folder', label: 'Open Folder', message: { kind: 'showChooser', mode: 'folder' } },
  { id: 'save', label: 'Save', shortcuts: [{ kind: 'key', key: 's', modifiers: { ctrl: true } }], enabled: state => state.activePath !== undefined, message: { kind: 'saveActive' } },
  { id: 'close', label: 'Close Buffer', enabled: state => state.activePath !== undefined, message: { kind: 'closeActive' } },
  { id: 'quit', label: 'Quit', shortcuts: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }, { kind: 'key', key: 'c', modifiers: { ctrl: true } }], message: { kind: 'exit' } },
], id => ({ kind: 'menuActivate', id }));

function menuItems(state: EditorState): readonly MenuItem[] {
  const items = editorCommands.menuItems(state);
  const first = items[0];
  return first === undefined ? [] : [{ id: 'file', kind: 'submenu', label: 'File', children: [first, ...items.slice(1)] }];
}

const editorControls = createTuiControls<EditorState>()({
  menu: (menu, transition: MenuBarTransition, state) => menuBarReducer(menu, transition, menuItems(state)),
  command: commandInputReducer,
  chooser: (chooser, transition: CommandInputTransition) => chooser === undefined
    ? chooser : { ...chooser, command: commandInputReducer(chooser.command, transition) },
  activePath: (activePath, transition: TabsTransition, state) => tabsReducer(
    activePath === undefined ? {} : { activeId: activePath, selectedId: activePath },
    transition, { tabs: state.buffers.map((buffer) => ({ id: buffer.path })), activation: 'automatic' },
  ).selectedId ?? activePath,
});

const explorer = createTuiChild(explorerDefinition(createTreeSource<EntryMetadata>([])),
  (message): EditorMessage => ({ kind: 'explorer', message }));

const editorPanel = createTuiChild(editorPanelDefinition, (message): EditorMessage => ({ kind: 'edit', message }));

const EDITOR_OPERATION_EFFECT_ID = 'editor-operation';
const MAX_EDITOR_BUFFERS = 32;
const MAX_EDITOR_FILE_BYTES = 4 * 1_024 * 1_024;

function initialState(explorerState: TuiChildState<ExplorerState<EntryMetadata>>): EditorState {
  return {
    nodes: [],
    explorer: explorerState,
    buffers: [],
    menu: { kind: 'closed', active: 'file' },
    command: emptyCommand(),
    operation: { kind: 'idle' },
    notice: 'Open a folder or file to start editing.',
    nextOperation: 1
  };
}

function emptyCommand(): CommandInputState {
  return createCommandInputState({ suggestions: createCommandSuggestions([]) });
}

export function createIdeEditorApp(operations: IdeEditorOperations = nodeEditorOperations) {
  return defineTui<EditorState, EditorMessage>({
    id: 'ide-editor',
    init: context => {
      const initialized = explorer.init({ id: 'explorer', generation: 0 }, context);
      return { ...initialized, state: initialState(initialized.state) };
    },
    update: (state, message, context) => {
      const updated = updateEditor(state, message, operations, context);
      if (updated.state.buffers === state.buffers) return updated;
      const retained = new Map(updated.state.buffers.map(buffer => [buffer.editor.id, buffer.editor.generation]));
      const removed = state.buffers.filter(buffer => retained.get(buffer.editor.id) !== buffer.editor.generation);
      return removed.length === 0 ? updated : { ...updated, cancel: [...(updated.cancel ?? []), ...removed.map(buffer => editorPanel.remove(buffer.editor))] };
    },
    view: editorView,
    inputBindings: editorCommands.inputBindings,
    nonTty: { mode: 'last_frame' }
  });
}

function updateEditor(
  state: EditorState,
  message: EditorMessage,
  operations: IdeEditorOperations,
  context: TuiContext
): TuiUpdateResult<EditorState, EditorMessage> {
  switch (message.kind) {
    case 'control': return editorControls.update(state, message);
    case 'explorer': {
      const { outputs, ...updated } = liftTuiResult(state, 'explorer', explorer.update(state.explorer, message.message, context));
      const selected = outputs?.[0];
      const node = selected === undefined ? undefined : findTreeNode(state.nodes, selected);
      if (node?.metadata?.entryKind !== 'file') return updated;
      const opened = requestOpen(updated.state, 'file', node.metadata.path, operations);
      return { ...updated, ...opened, effects: [...(updated.effects ?? []), ...(opened.effects ?? [])] };
    }
    case 'menuActivate': {
      const command = editorCommands.resolve(state, message.id);
      return command === undefined ? result(state) : updateEditor(state, command, operations, context);
    }
    case 'closeTab':
      return result(closeBuffer(state, message.event.id));
    case 'edit': {
      const buffer = state.buffers.find((candidate) => candidate.path === message.message.id);
      if (buffer === undefined) return result(state);
      const updated = editorPanel.update(buffer.editor, message.message, context);
      const editor = updated.state;
      if (textDocumentBytes(editor.state.editor.document) > MAX_EDITOR_FILE_BYTES) {
        return result({ ...state, notice: `Files are limited to ${formatByteLimit(MAX_EDITOR_FILE_BYTES)} in this example.` });
      }
      return { ...updated, state: editor === buffer.editor ? state : updateBuffer(state, buffer.path, candidate => ({ ...candidate, editor })) };
    }
    case 'submitCommand':
      return submitCommand(state, message.value, operations, context);
    case 'showChooser':
      return result({ ...state, chooser: { mode: message.mode, command: emptyCommand() } });
    case 'submitChooser':
      return state.chooser === undefined
        ? result(state)
        : requestOpen(withoutChooser(state), state.chooser.mode, message.value, operations);
    case 'dismissChooser':
      return result(withoutChooser(state));
    case 'requestOpen':
      return requestOpen(state, message.mode, message.path, operations);
    case 'workspaceLoaded': {
      if (!isCurrentOperation(state, message.requestId, 'open')) return result(state);
      const tree: ScrollableTreeState = {
        expandedIds: message.nodes.filter(node => node.kind !== 'leaf').map(node => node.id),
        ...(message.nodes[0]?.id === undefined ? {} : { activeId: message.nodes[0].id }),
        selection: message.nodes[0]?.id === undefined ? { mode: 'single', selectionFollowsActive: true }
          : { mode: 'single', selectedId: message.nodes[0].id, selectionFollowsActive: true },
        scroll: createScrollState(),
      };
      return liftTuiResult({ ...state, root: message.root, nodes: message.nodes, operation: { kind: 'idle' as const }, notice: `Opened workspace ${message.root}` },
        'explorer', explorer.update(state.explorer, { ...state.explorer, message: { kind: 'replace', source: createTreeSource(message.nodes), tree } }, context));
    }
    case 'fileLoaded':
      if (!isCurrentOperation(state, message.requestId, 'open')) return result(state);
      return result(openBuffer(state, message.path, message.content, context));
    case 'fileSaved': {
      if (state.operation.kind !== 'pending'
        || state.operation.operation !== 'save'
        || state.operation.requestId !== message.requestId
        || state.operation.path !== message.path) {
        return result(state);
      }
      const savedDocument = state.operation.document;
      return result({
        ...updateBuffer(state, message.path, (buffer) => ({ ...buffer, savedDocument })),
        operation: { kind: 'idle' },
        notice: `Saved ${shortPath(state.root, message.path)}`
      });
    }
    case 'operationFailed':
      if (!isCurrentOperation(state, message.requestId)) return result(state);
      return result({
        ...state,
        operation: { kind: 'failed', requestId: message.requestId, message: message.message },
        notice: message.message,
      });
    case 'saveActive':
      return saveActive(state, operations);
    case 'closeActive':
      return result(closeActive(state));
    case 'exit':
      return requestExit(state, 'user requested exit');
  }
}

function submitCommand(
  state: EditorState,
  rawValue: string,
  operations: IdeEditorOperations,
  context: TuiContext
): TuiUpdateResult<EditorState, EditorMessage> {
  const value = rawValue.trim();
  const [command, ...arguments_] = value.split(/\s+/u);
  const argument = arguments_.join(' ');
  const cleared = { ...state, command: emptyCommand() };
  switch (command) {
    case '/open': return requestOpen(cleared, 'file', argument, operations);
    case '/folder': return requestOpen(cleared, 'folder', argument, operations);
    case '/save':
    case '/close': {
      const message = editorCommands.resolve(cleared, command.slice(1));
      return message === undefined ? result(cleared) : updateEditor(cleared, message, operations, context);
    }
    case '': return result(cleared);
    default: return result({ ...cleared, notice: `Unknown command: ${command ?? ''}` });
  }
}

function requestOpen(
  state: EditorState,
  mode: OpenMode,
  requestedPath: string,
  operations: IdeEditorOperations
): TuiUpdateResult<EditorState, EditorMessage> {
  const requestId = `open-${String(state.nextOperation)}`;
  const resolved = resolveRequestedPath(state.root, requestedPath);
  if (mode === 'file'
    && !state.buffers.some((buffer) => buffer.path === resolved)
    && state.buffers.length >= MAX_EDITOR_BUFFERS) {
    return result({ ...state, notice: `Close a buffer before opening more than ${String(MAX_EDITOR_BUFFERS)} files.` });
  }
  return {
    state: {
      ...state,
      operation: { kind: 'pending', operation: 'open', requestId, label: `Opening ${resolved}` },
      nextOperation: state.nextOperation + 1
    },
    effects: [openEffect(requestId, mode, resolved, operations)]
  };
}

function saveActive(
  state: EditorState,
  operations: IdeEditorOperations
): TuiUpdateResult<EditorState, EditorMessage> {
  const buffer = activeBuffer(state);
  if (buffer === undefined) return result({ ...state, notice: 'No active buffer to save.' });
  if (!isDirty(buffer)) return result({ ...state, notice: `${buffer.label} is already saved.` });
  const requestId = `save-${String(state.nextOperation)}`;
  const document = buffer.editor.state.editor.document;
  return {
    state: {
      ...state,
      operation: {
        kind: 'pending',
        operation: 'save',
        requestId,
        label: `Saving ${buffer.path}`,
        path: buffer.path,
        document,
      },
      nextOperation: state.nextOperation + 1
    },
    effects: [saveEffect(requestId, buffer.path, textDocumentText(document), operations)]
  };
}

function openEffect(
  requestId: string,
  mode: OpenMode,
  targetPath: string,
  operations: IdeEditorOperations
): TuiEffect<EditorMessage> {
  return {
    id: EDITOR_OPERATION_EFFECT_ID,
    concurrency: 'replace',
    async run(context) {
      context.signal.throwIfAborted();
      const opened = await operations.open(mode, targetPath, context.signal);
      context.signal.throwIfAborted();
      return opened.kind === 'folder'
        ? { kind: 'message', message: { kind: 'workspaceLoaded', requestId, root: opened.root, nodes: opened.nodes } }
        : { kind: 'message', message: { kind: 'fileLoaded', requestId, path: opened.path, content: opened.content } };
    },
    onError: ({ diagnostic }) => ({
      kind: 'message',
      message: { kind: 'operationFailed', requestId, message: diagnostic.message }
    })
  };
}

function saveEffect(
  requestId: string,
  targetPath: string,
  content: string,
  operations: IdeEditorOperations
): TuiEffect<EditorMessage> {
  return {
    id: EDITOR_OPERATION_EFFECT_ID,
    concurrency: 'replace',
    async run(context) {
      context.signal.throwIfAborted();
      await operations.save(targetPath, content, context.signal);
      context.signal.throwIfAborted();
      return { kind: 'message', message: { kind: 'fileSaved', requestId, path: targetPath } };
    },
    onError: ({ diagnostic }) => ({
      kind: 'message',
      message: { kind: 'operationFailed', requestId, message: diagnostic.message }
    })
  };
}

const nodeEditorOperations: IdeEditorOperations = {
  async open(mode, targetPath, signal) {
    signal.throwIfAborted();
    const info = await stat(targetPath);
    if (mode === 'folder') {
      if (!info.isDirectory()) throw new Error(`${targetPath} is not a directory`);
      return { kind: 'folder', root: targetPath, nodes: await readDirectoryTree(targetPath, signal) };
    }
    if (!info.isFile()) throw new Error(`${targetPath} is not a file`);
    if (info.size > MAX_EDITOR_FILE_BYTES) {
      throw new Error(`${targetPath} exceeds the ${formatByteLimit(MAX_EDITOR_FILE_BYTES)} example file limit`);
    }
    const content = await readFile(targetPath, { encoding: 'utf8', signal });
    signal.throwIfAborted();
    return { kind: 'file', path: targetPath, content };
  },
  async save(targetPath, content, signal) {
    signal.throwIfAborted();
    await writeFile(targetPath, content, { encoding: 'utf8', signal });
    signal.throwIfAborted();
  }
};

export const ideEditorApp = createIdeEditorApp();

async function readDirectoryTree(root: string, signal: AbortSignal): Promise<readonly TreeNode<EntryMetadata>[]> {
  let remaining = 400;
  const visit = async (directory: string, depth: number): Promise<readonly TreeNode<EntryMetadata>[]> => {
    signal.throwIfAborted();
    if (remaining <= 0 || depth > 4) return [];
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.name !== 'node_modules' && entry.name !== '.git')
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
    const nodes: TreeNode<EntryMetadata>[] = [];
    for (const entry of entries) {
      if (remaining <= 0) break;
      remaining -= 1;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const children = await visit(entryPath, depth + 1);
        nodes.push({
          id: entryPath,
          kind: 'branch',
          label: entry.name,
          children,
          metadata: { path: entryPath, entryKind: 'directory' }
        });
      } else if (entry.isFile()) {
        nodes.push({
          id: entryPath,
          kind: 'leaf',
          label: entry.name,
          icon: '·',
          metadata: { path: entryPath, entryKind: 'file' }
        });
      }
    }
    return nodes;
  };
  return visit(root, 0);
}

function editorView(state: EditorState, context: TuiContext): Element<EditorMessage> {
  if (context.terminalSize.columns < 80 || context.terminalSize.rows < 16) {
    return editorMinimumSizeNotice();
  }
  const main = splitPane([
    explorerPane(state, context),
    editorPane(state, context),
    detailsPane(state)
  ], {
    id: 'editor-main-split',
    direction: 'horizontal',
    sizes: [{ kind: 'fixed', cells: 28 }, { kind: 'fill' }, { kind: 'fixed', cells: 28 }],
    gap: 1
  });
  const base = grid({
    id: 'editor-root',
    areas: `
      menu
      main
      command
      status
    `,
    children: {
      menu: topMenu(state),
      main,
      command: commandPane(state),
      status: editorStatus(state)
    },
    columns: [{ kind: 'fill' }],
    rows: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 1 }
    ]
  });
  return state.chooser === undefined ? base : overlay([base, chooserDialog(state.chooser)]);
}

function editorMinimumSizeNotice(): Element<EditorMessage> {
  return surface(column([
    text({ id: 'editor-size-title', content: 'IDE Editor', textRole: 'title' }),
    text({ id: 'editor-size-message', content: 'This example requires at least 80 columns and 16 rows.' }),
  ], { id: 'editor-size-content', gap: 1 }), {
    id: 'editor-root',
    appearance: 'inset',
    padding: 1,
    meta: { accessibility: { role: 'application', label: 'Editor size requirement' } },
  });
}

function topMenu(state: EditorState): Element<EditorMessage> {
  return surface(menuBar({
    id: 'editor-menu',
    meta: { accessibleName: 'Application menu' },
    items: menuItems(state),
    view: menuBarView(menuItems(state), state.menu),
    onTransition: editorControls.onTransition('menu'),
    onActivate: (event): EditorMessage => ({ kind: 'menuActivate', id: event.id }),
  }), { id: 'editor-menu-surface', appearance: 'bar', padding: { left: 1, right: 1 } });
}

function explorerPane(state: EditorState, context: TuiContext): Element<EditorMessage> {
  return surface(column([
    text({ content: 'Explorer', id: 'explorer-heading', textRole: 'heading' }),
    text({ content: state.root === undefined ? 'No folder open' : path.basename(state.root), id: 'explorer-root', textRole: 'metadata' }),
    explorer.view(state.explorer, context),
    helpBar({ id: 'explorer-help', groups: [{ id: 'tree', bindings: [
      { binding: { kind: 'key', key: 'enter' }, label: 'open' },
      { binding: { kind: 'key', key: 'arrowRight' }, label: 'expand' },
    ] }] })
  ], {
    id: 'explorer-layout',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }]
  }), { id: 'explorer', appearance: 'inset', padding: { left: 1, right: 1 } });
}

function editorPane(state: EditorState, context: TuiContext): Element<EditorMessage> {
  if (state.buffers.length === 0) {
    return surface(column([
      text({ content: 'Open a folder or file to start editing.', id: 'empty-title', textRole: 'heading' }),
      text({ content: '/open <path> and /folder <path> run asynchronously.', id: 'empty-help', textRole: 'body' })
    ], { id: 'empty-editor', gap: 1 }), { id: 'editor-empty', appearance: 'neutral', padding: 1 });
  }
  return tabs({
    id: 'editor-tabs',
    meta: { accessibleName: 'Open editors' },
    maxTabWidth: 28,
    tabs: state.buffers.map((buffer) => ({
      id: buffer.path,
      label: `${buffer.label}${isDirty(buffer) ? ' •' : ''}`,
      closable: true,
      panel: editorPanel.view(buffer.editor, context)
    })),
    state: state.activePath === undefined
      ? {}
      : { activeId: state.activePath, selectedId: state.activePath },
    onTransition: editorControls.onTransition('activePath'),
    onClose: (event): EditorMessage => ({ kind: 'closeTab', event }),
  });
}

function detailsPane(state: EditorState): Element<EditorMessage> {
  const buffer = activeBuffer(state);
  const operation = state.operation.kind === 'idle' ? 'ready' : state.operation.kind;
  return surface(column([
    text({ content: buffer?.label ?? 'No file selected', textRole: 'heading' }),
    text({ content: state.notice, textRole: 'body' }),
    text({ content: `workspace  ${state.root ?? 'none'}`, textRole: 'metadata' }),
    text({ content: `buffers    ${String(state.buffers.length)}`, textRole: 'metadata' }),
    text({ content: `dirty      ${String(state.buffers.filter(isDirty).length)}`, textRole: 'metadata' }),
    text({ content: `operation  ${operation}`, textRole: 'metadata' })
  ], { gap: 1 }), {
    id: 'editor-details',
    appearance: 'inset',
    padding: { left: 1, right: 1 }
  });
}

function commandPane(state: EditorState): Element<EditorMessage> {
  return surface(commandInput({
    id: 'editor-command',
    prompt: '› ',
    placeholder: '/open README.md, /folder src, /save, /close',
    view: commandInputView(state.command),
    display: 'popup',
    placement: 'above',
    maxVisibleSuggestions: 6,
    onTransition: editorControls.onTransition('command'),
    onSubmit: (event): EditorMessage => ({ kind: 'submitCommand', value: event.value })
  }), {
    id: 'editor-command-surface',
    appearance: 'bar',
    padding: { left: 1, right: 1 }
  });
}

function editorStatus(state: EditorState) {
  const active = activeBuffer(state);
  return statusBar({
    id: 'editor-status',
    leading: [{ id: 'operation', kind: 'status', text: state.operation.kind, status: state.operation.kind === 'failed' ? 'error' : state.operation.kind === 'pending' ? 'running' : 'success' }],
    center: [{ id: 'file', kind: 'text', text: active === undefined ? 'No buffer' : shortPath(state.root, active.path) }],
    trailing: [{ id: 'dirty', kind: 'text', text: `${String(state.buffers.filter(isDirty).length)} unsaved` }]
  });
}

function chooserDialog(chooser: ChooserState): Element<EditorMessage> {
  return dialog({
    slots: {
      content: commandInput({
        id: 'path-chooser-input',
        prompt: 'Path › ',
        placeholder: chooser.mode === 'folder' ? '/path/to/folder' : '/path/to/file',
        view: commandInputView(chooser.command),
        display: 'compact',
        onTransition: editorControls.onTransition('chooser'),
        onSubmit: (event): EditorMessage => ({ kind: 'submitChooser', value: event.value })
      })
    },
    id: 'path-chooser',
    title: chooser.mode === 'folder' ? 'Open Folder' : 'Open File',
    modal: true,
    focusPolicy: { initialFocus: { kind: 'element', elementId: 'path-chooser-input' }, returnFocus: 'restore' },
    dismissal: { dismissOnEscape: true, dismissOnOutsidePress: true },
    onDismiss: (): EditorMessage => ({ kind: 'dismissChooser' }),
    width: 72,
    padding: { left: 1, right: 1 }
  });
}

function openBuffer(state: EditorState, targetPath: string, content: string, context: TuiContext): EditorState {
  const existing = state.buffers.find((buffer) => buffer.path === targetPath);
  if (existing !== undefined) {
    return { ...state, activePath: targetPath, operation: { kind: 'idle' }, notice: `Selected ${existing.label}` };
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_EDITOR_FILE_BYTES) {
    return {
      ...state,
      operation: { kind: 'idle' },
      notice: `${targetPath} exceeds the ${formatByteLimit(MAX_EDITOR_FILE_BYTES)} example file limit.`,
    };
  }
  if (state.buffers.length >= MAX_EDITOR_BUFFERS) {
    return {
      ...state,
      operation: { kind: 'idle' },
      notice: `Close a buffer before opening more than ${String(MAX_EDITOR_BUFFERS)} files.`,
    };
  }
  const initialized = editorPanel.init({ id: targetPath, generation: state.nextOperation }, context).state;
  const editor = editorPanel.update(initialized, { ...initialized, message: { kind: 'load', label: path.basename(targetPath), content } }, context).state;
  const buffer: EditorBuffer = {
    path: targetPath,
    label: path.basename(targetPath),
    editor,
    savedDocument: editor.state.editor.document,
  };
  return {
    ...state,
    buffers: [...state.buffers, buffer],
    activePath: targetPath,
    operation: { kind: 'idle' },
    notice: `Opened ${shortPath(state.root, targetPath)}`
  };
}

function closeActive(state: EditorState): EditorState {
  return state.activePath === undefined ? state : closeBuffer(state, state.activePath);
}

function closeBuffer(state: EditorState, targetPath: string): EditorState {
  const index = state.buffers.findIndex((buffer) => buffer.path === targetPath);
  if (index < 0) return state;
  const target = state.buffers[index];
  if (target !== undefined && isDirty(target)) {
    return { ...state, notice: `Save ${target.label} before closing it.` };
  }
  const buffers = state.buffers.filter((buffer) => buffer.path !== targetPath);
  if (state.activePath !== targetPath) {
    return { ...state, buffers, notice: `Closed ${path.basename(targetPath)}` };
  }
  const fallback = buffers[Math.min(index, Math.max(0, buffers.length - 1))];
  const next = {
    ...state,
    buffers,
    notice: `Closed ${path.basename(targetPath)}`
  };
  if (fallback !== undefined) return { ...next, activePath: fallback.path };
  const { activePath, ...withoutActivePath } = next;
  void activePath;
  return withoutActivePath;
}

function updateBuffer(
  state: EditorState,
  targetPath: string,
  update: (buffer: EditorBuffer) => EditorBuffer
): EditorState {
  return { ...state, buffers: state.buffers.map((buffer) => buffer.path === targetPath ? update(buffer) : buffer) };
}

function activeBuffer(state: EditorState): EditorBuffer | undefined {
  return state.buffers.find((buffer) => buffer.path === state.activePath);
}

function isDirty(buffer: EditorBuffer): boolean {
  return buffer.editor.state.editor.document !== buffer.savedDocument;
}

function isCurrentOperation(
  state: EditorState,
  requestId: string,
  operation?: 'open' | 'save',
): boolean {
  return state.operation.kind === 'pending'
    && state.operation.requestId === requestId
    && (operation === undefined || state.operation.operation === operation);
}

function requestExit(
  state: EditorState,
  reason: string,
): TuiUpdateResult<EditorState, EditorMessage> {
  const dirtyCount = state.buffers.filter(isDirty).length;
  return dirtyCount === 0
    ? { state, exit: { reason } }
    : result({ ...state, notice: `Save ${String(dirtyCount)} unsaved buffer${dirtyCount === 1 ? '' : 's'} before exiting.` });
}

function formatByteLimit(bytes: number): string {
  return `${String(bytes / (1_024 * 1_024))} MiB`;
}

function withoutChooser(state: EditorState): EditorState {
  const { chooser, ...rest } = state;
  void chooser;
  return rest;
}

function findTreeNode(
  nodes: readonly TreeNode<EntryMetadata>[],
  id: string
): TreeNode<EntryMetadata> | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.kind === 'branch') {
      const nested = findTreeNode(node.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function resolveRequestedPath(root: string | undefined, requestedPath: string): string {
  const trimmed = requestedPath.trim();
  const base = root ?? process.cwd();
  return path.resolve(base, trimmed.length === 0 ? '.' : trimmed);
}

function shortPath(root: string | undefined, targetPath: string): string {
  if (root === undefined) return targetPath;
  const relative = path.relative(root, targetPath);
  return relative.length === 0 ? '.' : relative;
}

function result(state: EditorState): TuiUpdateResult<EditorState, EditorMessage> {
  return { state };
}

export async function runScriptedIdeEditor() {
  const fixture = await mkdtemp(path.join(tmpdir(), 'terminal-ui-ide-'));
  const sourceDirectory = path.join(fixture, 'src');
  const readmePath = path.join(fixture, 'README.md');
  const planPath = path.join(sourceDirectory, 'plan.md');
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(readmePath, '# Workspace\n', 'utf8');
  await writeFile(planPath, 'first line\nsecond line\n', 'utf8');
  const host = createMemoryTerminalHost({ terminalSize: { columns: 150, rows: 38 } });
  const runtime = createTuiRuntime({ app: ideEditorApp, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'requestOpen', mode: 'folder', path: fixture });
    await waitForIdle(runtime);
    await runtime.dispatch({ kind: 'requestOpen', mode: 'file', path: planPath });
    await waitForIdle(runtime);
    const editor = runtime.state().buffers.find(buffer => buffer.path === planPath)?.editor;
    if (editor === undefined) throw new Error('Editor did not open');
    await runtime.dispatch({ kind: 'edit', message: { id: editor.id, generation: editor.generation, message: { kind: 'transition', transition: { kind: 'edit', operation: { kind: 'insert', text: 'planned: ' } } } } });
    await runtime.dispatch({ kind: 'saveActive' });
    await waitForIdle(runtime);
    await runtime.dispatch({ kind: 'requestOpen', mode: 'file', path: readmePath });
    await waitForIdle(runtime);
    await runtime.dispatch({ kind: 'showChooser', mode: 'file' });
    const chooserFrame = runtime.frame();
    if (chooserFrame === undefined) throw new Error('Missing chooser frame');
    const chooserVisible = renderFramePlain(chooserFrame).includes('Open File');
    await runtime.dispatch({ kind: 'dismissChooser' });
    const frame = await runtime.resize({ columns: 96, rows: 30 });
    return {
      status: 'completed',
      rootOpened: runtime.state().root === fixture,
      activeFile: path.basename(runtime.state().activePath ?? ''),
      savedPlan: (await readFile(planPath, 'utf8')).startsWith('planned: '),
      chooserVisible,
      openBuffers: runtime.state().buffers.length,
      dirtyBuffers: runtime.state().buffers.filter(isDirty).length,
      treeTargets: frame.hitTargets?.filter((target) => target.id.includes('tree')).length ?? 0,
      visible: renderFramePlain(frame).includes('README.md'),
      frames: runtime.metrics().frameCommits
    };
  } finally {
    await runtime.dispose();
    await rm(fixture, { recursive: true, force: true });
  }
}

async function waitForIdle(runtime: TuiRuntime<EditorState, EditorMessage>): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (runtime.state().operation.kind !== 'pending') return;
    await runtime.nextChange();
  }
  throw new Error('IDE operation did not settle');
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const exit = await runTui(ideEditorApp);
    if (exit.status !== 'completed') process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(await runScriptedIdeEditor(), null, 2)}\n`);
  }
}
