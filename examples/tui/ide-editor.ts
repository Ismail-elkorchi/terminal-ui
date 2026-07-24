import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { createMemoryTerminalHost, createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import { column, grid, overlay, surface } from '@ismail-elkorchi/terminal-ui/layout';
import {
  commandInput,
  dialog,
  helpBar,
  menuBar,
  statusBar,
  structuredBlock,
  tabs,
  text,
  textArea,
  tree
} from '@ismail-elkorchi/terminal-ui/components';
import type { MenuItem, TabAction, TextAreaAction, TreeInteractionAction, TreeNode } from '@ismail-elkorchi/terminal-ui/components';
import {
  commandInputPresentation,
  createTextAreaState,
  commandInputReducer,
  createScrollState,
  menuBarPresentation,
  menuBarReducer,
  tabsReducer,
  textAreaPresentation,
  textAreaReducer,
  treeReducer,
  treeScrollablePresentation,
  visibleTreeRows
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { CommandInputAction, CommandInputState, MenuBarState, ScrollableTreeState, TextAreaState } from '@ismail-elkorchi/terminal-ui/behavior';
import { createTuiRuntime, defineTui, runTui } from '@ismail-elkorchi/terminal-ui/tui';
import type { TuiEffect, TuiRuntime, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui/tui';
import type { Element } from '@ismail-elkorchi/terminal-ui/components';
import { textDocumentText } from '@ismail-elkorchi/terminal-ui/text';

type EntryMetadata = Readonly<{
  path: string;
  entryKind: 'file' | 'directory';
}>;

interface EditorBuffer {
  readonly path: string;
  readonly label: string;
  readonly editor: TextAreaState;
  readonly savedText: string;
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
  | { readonly kind: 'pending'; readonly id: string; readonly label: string }
  | { readonly kind: 'failed'; readonly id: string; readonly message: string };

interface ChooserState {
  readonly mode: OpenMode;
  readonly command: CommandInputState;
}

interface EditorState {
  readonly root?: string;
  readonly tree: ScrollableTreeState<EntryMetadata>;
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
  | { readonly kind: 'menu'; readonly action: Parameters<typeof menuBarReducer>[1] }
  | { readonly kind: 'tree'; readonly action: TreeInteractionAction }
  | { readonly kind: 'tabs'; readonly action: TabAction }
  | { readonly kind: 'edit'; readonly path: string; readonly action: TextAreaAction }
  | { readonly kind: 'command'; readonly action: CommandInputAction }
  | { readonly kind: 'submitCommand'; readonly value: string }
  | { readonly kind: 'showChooser'; readonly mode: OpenMode }
  | { readonly kind: 'chooser'; readonly action: CommandInputAction }
  | { readonly kind: 'submitChooser'; readonly value: string }
  | { readonly kind: 'dismissChooser' }
  | { readonly kind: 'requestOpen'; readonly mode: OpenMode; readonly path: string }
  | { readonly kind: 'workspaceLoaded'; readonly id: string; readonly root: string; readonly nodes: readonly TreeNode<EntryMetadata>[] }
  | { readonly kind: 'fileLoaded'; readonly id: string; readonly path: string; readonly content: string }
  | { readonly kind: 'fileSaved'; readonly id: string; readonly path: string; readonly content: string }
  | { readonly kind: 'operationFailed'; readonly id: string; readonly message: string }
  | { readonly kind: 'saveActive' }
  | { readonly kind: 'closeActive' }
  | { readonly kind: 'exit' };

const menuItems: readonly MenuItem[] = [{
  id: 'file',
  kind: 'submenu',
  label: 'File',
  children: [
    { id: 'open-file', kind: 'action', label: 'Open File', shortcut: 'Ctrl+O' },
    { id: 'open-folder', kind: 'action', label: 'Open Folder' },
    { id: 'save', kind: 'action', label: 'Save', shortcut: 'Ctrl+S' },
    { id: 'close', kind: 'action', label: 'Close Buffer' },
    { id: 'quit', kind: 'action', label: 'Quit', shortcut: 'Ctrl+Q' }
  ]
}, {
  id: 'view',
  kind: 'submenu',
  label: 'View',
  children: [
    { id: 'focus-explorer', kind: 'action', label: 'Focus Explorer' },
    { id: 'focus-editor', kind: 'action', label: 'Focus Editor' }
  ]
}];

function initialState(): EditorState {
  return {
    tree: {
      nodes: [],
      scroll: createScrollState({ contentRows: 0, viewportRows: 20 })
    },
    buffers: [],
    menu: { kind: 'closed', active: 'file' },
    command: emptyCommand(),
    operation: { kind: 'idle' },
    notice: 'Open a folder or file to start editing.',
    nextOperation: 1
  };
}

function emptyCommand(): CommandInputState {
  return { input: { text: '', cursor: 0 }, history: [], suggestions: [] };
}

export function createIdeEditorApp(operations: IdeEditorOperations = nodeEditorOperations) {
  return defineTui<EditorState, EditorMessage>({
    id: 'ide-editor',
    init: initialState,
    update: (state, message) => updateEditor(state, message, operations),
    view: editorView,
    inputBindings: [
      {
        id: 'exit',
        triggers: [
          { kind: 'key', key: 'c', modifiers: { ctrl: true } },
          { kind: 'key', key: 'q', modifiers: { ctrl: true } }
        ],
        message: { kind: 'exit' }
      },
      {
        id: 'save',
        triggers: [{ kind: 'key', key: 's', modifiers: { ctrl: true } }],
        message: { kind: 'saveActive' }
      },
      {
        id: 'open',
        triggers: [{ kind: 'key', key: 'o', modifiers: { ctrl: true } }],
        message: { kind: 'showChooser', mode: 'file' }
      }
    ],
    nonTty: { mode: 'last_frame' }
  });
}

function updateEditor(
  state: EditorState,
  message: EditorMessage,
  operations: IdeEditorOperations
): TuiUpdateResult<EditorState, EditorMessage> {
  switch (message.kind) {
    case 'menu': {
      const menu = menuBarReducer(state.menu, message.action, menuItems);
      const activated = message.action.kind === 'menu' && message.action.action.kind === 'activate'
        ? message.action.action.id
        : undefined;
      return activated === undefined
        ? result({ ...state, menu })
        : commandResult({ ...state, menu }, activated, operations);
    }
    case 'tree': {
      const treeState = treeReducer(state.tree, message.action);
      if (message.action.kind !== 'activate') return result({ ...state, tree: treeState });
      const node = findTreeNode(state.tree.nodes, message.action.id);
      if (node?.metadata?.entryKind !== 'file') return result({ ...state, tree: treeState });
      return requestOpen({ ...state, tree: treeState }, 'file', node.metadata.path, operations);
    }
    case 'tabs':
      return updateTabs(state, message.action);
    case 'edit':
      return result(updateBuffer(state, message.path, (buffer) => ({
        ...buffer,
        editor: textAreaReducer(buffer.editor, message.action)
      })));
    case 'command':
      return result({ ...state, command: commandInputReducer(state.command, message.action) });
    case 'submitCommand':
      return submitCommand(state, message.value, operations);
    case 'showChooser':
      return result({ ...state, chooser: { mode: message.mode, command: emptyCommand() } });
    case 'chooser':
      return state.chooser === undefined
        ? result(state)
        : result({
            ...state,
            chooser: { ...state.chooser, command: commandInputReducer(state.chooser.command, message.action) }
          });
    case 'submitChooser':
      return state.chooser === undefined
        ? result(state)
        : requestOpen(withoutChooser(state), state.chooser.mode, message.value, operations);
    case 'dismissChooser':
      return result(withoutChooser(state));
    case 'requestOpen':
      return requestOpen(state, message.mode, message.path, operations);
    case 'workspaceLoaded':
      if (!isCurrentOperation(state, message.id)) return result(state);
      return result({
        ...state,
        root: message.root,
        tree: {
          nodes: message.nodes,
          ...(message.nodes[0]?.id === undefined ? {} : { selected: message.nodes[0].id }),
          scroll: createScrollState({
            contentRows: visibleTreeRows(message.nodes).length,
            viewportRows: 24
          })
        },
        operation: { kind: 'idle' },
        notice: `Opened workspace ${message.root}`
      });
    case 'fileLoaded':
      if (!isCurrentOperation(state, message.id)) return result(state);
      return result(openBuffer(state, message.path, message.content));
    case 'fileSaved':
      if (!isCurrentOperation(state, message.id)) return result(state);
      return result({
        ...updateBuffer(state, message.path, (buffer) => ({ ...buffer, savedText: message.content })),
        operation: { kind: 'idle' },
        notice: `Saved ${shortPath(state.root, message.path)}`
      });
    case 'operationFailed':
      if (!isCurrentOperation(state, message.id)) return result(state);
      return result({ ...state, operation: { kind: 'failed', id: message.id, message: message.message }, notice: message.message });
    case 'saveActive':
      return saveActive(state, operations);
    case 'closeActive':
      return result(closeActive(state));
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
}

function commandResult(
  state: EditorState,
  command: string,
  operations: IdeEditorOperations
): TuiUpdateResult<EditorState, EditorMessage> {
  switch (command) {
    case 'open-file': return result({ ...state, chooser: { mode: 'file', command: emptyCommand() } });
    case 'open-folder': return result({ ...state, chooser: { mode: 'folder', command: emptyCommand() } });
    case 'save': return saveActive(state, operations);
    case 'close': return result(closeActive(state));
    case 'quit': return { state, exit: { reason: 'menu quit' } };
    default: return result({ ...state, notice: `${command} is a focus command in this example.` });
  }
}

function submitCommand(
  state: EditorState,
  rawValue: string,
  operations: IdeEditorOperations
): TuiUpdateResult<EditorState, EditorMessage> {
  const value = rawValue.trim();
  const [command, ...arguments_] = value.split(/\s+/u);
  const argument = arguments_.join(' ');
  const cleared = { ...state, command: emptyCommand() };
  switch (command) {
    case '/open': return requestOpen(cleared, 'file', argument, operations);
    case '/folder': return requestOpen(cleared, 'folder', argument, operations);
    case '/save': return saveActive(cleared, operations);
    case '/close': return result(closeActive(cleared));
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
  const id = `open-${String(state.nextOperation)}`;
  const resolved = resolveRequestedPath(state.root, requestedPath);
  return {
    state: {
      ...state,
      operation: { kind: 'pending', id, label: `Opening ${resolved}` },
      nextOperation: state.nextOperation + 1
    },
    effects: [openEffect(id, mode, resolved, operations)]
  };
}

function saveActive(
  state: EditorState,
  operations: IdeEditorOperations
): TuiUpdateResult<EditorState, EditorMessage> {
  const buffer = activeBuffer(state);
  if (buffer === undefined) return result({ ...state, notice: 'No active buffer to save.' });
  const id = `save-${String(state.nextOperation)}`;
  return {
    state: {
      ...state,
      operation: { kind: 'pending', id, label: `Saving ${buffer.path}` },
      nextOperation: state.nextOperation + 1
    },
    effects: [saveEffect(id, buffer.path, textDocumentText(buffer.editor.document), operations)]
  };
}

function openEffect(
  id: string,
  mode: OpenMode,
  targetPath: string,
  operations: IdeEditorOperations
): TuiEffect<EditorMessage> {
  return {
    id,
    concurrency: 'replace',
    async run(context) {
      context.signal.throwIfAborted();
      const opened = await operations.open(mode, targetPath, context.signal);
      context.signal.throwIfAborted();
      return opened.kind === 'folder'
        ? { kind: 'message', message: { kind: 'workspaceLoaded', id, root: opened.root, nodes: opened.nodes } }
        : { kind: 'message', message: { kind: 'fileLoaded', id, path: opened.path, content: opened.content } };
    },
    onError: ({ diagnostic }) => ({
      kind: 'message',
      message: { kind: 'operationFailed', id, message: diagnostic.message }
    })
  };
}

function saveEffect(
  id: string,
  targetPath: string,
  content: string,
  operations: IdeEditorOperations
): TuiEffect<EditorMessage> {
  return {
    id,
    concurrency: 'replace',
    async run(context) {
      context.signal.throwIfAborted();
      await operations.save(targetPath, content, context.signal);
      context.signal.throwIfAborted();
      return { kind: 'message', message: { kind: 'fileSaved', id, path: targetPath, content } };
    },
    onError: ({ diagnostic }) => ({
      kind: 'message',
      message: { kind: 'operationFailed', id, message: diagnostic.message }
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
    const content = await readFile(targetPath, 'utf8');
    signal.throwIfAborted();
    return { kind: 'file', path: targetPath, content };
  },
  async save(targetPath, content, signal) {
    signal.throwIfAborted();
    await writeFile(targetPath, content, 'utf8');
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
          icon: '▸',
          expanded: depth < 1,
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

function editorView(state: EditorState): Element<EditorMessage> {
  const main = grid({
    id: 'editor-main-grid',
    areas: 'explorer editor details',
    children: {
      explorer: explorerPane(state),
      editor: editorPane(state),
      details: detailsPane(state)
    },
    columns: [{ kind: 'fixed', cells: 28 }, { kind: 'fill' }, { kind: 'fixed', cells: 28 }],
    rows: [{ kind: 'fill' }],
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
      { kind: 'fixed', cells: 2 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 1 }
    ]
  });
  return state.chooser === undefined ? base : overlay([base, chooserDialog(state.chooser)]);
}

function topMenu(state: EditorState): Element<EditorMessage> {
  return surface(menuBar({
    id: 'editor-menu',
    items: menuItems,
    presentation: menuBarPresentation(menuItems, state.menu),
    onAction: (action): EditorMessage => ({ kind: 'menu', action })
  }), { id: 'editor-menu-surface', appearance: 'chrome', padding: { left: 1, right: 1 } });
}

function explorerPane(state: EditorState): Element<EditorMessage> {
  return surface(column([
    text('Explorer', { id: 'explorer-heading', textRole: 'heading' }),
    text(state.root === undefined ? 'No folder open' : path.basename(state.root), { id: 'explorer-root', textRole: 'metadata' }),
    tree({
      id: 'editor-tree',
      ...treeScrollablePresentation(state.tree),
      emptyText: 'Use /folder <path>',
      onAction: (action): EditorMessage => ({ kind: 'tree', action })
    }),
    helpBar({ id: 'explorer-help', groups: [{ id: 'tree', bindings: [{ key: 'Enter', label: 'open' }, { key: '←/→', label: 'fold' }] }] })
  ], {
    id: 'explorer-layout',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }]
  }), { id: 'explorer', appearance: 'inset', padding: 1 });
}

function editorPane(state: EditorState): Element<EditorMessage> {
  if (state.buffers.length === 0) {
    return surface(column([
      text('Open a folder or file to start editing.', { id: 'empty-title', textRole: 'heading' }),
      text('/open <path> and /folder <path> run asynchronously.', { id: 'empty-help', textRole: 'body' })
    ], { id: 'empty-editor', gap: 1 }), { id: 'editor-empty', appearance: 'neutral', padding: 1 });
  }
  return tabs({
    id: 'editor-tabs',
    tabs: state.buffers.map((buffer) => ({
      id: buffer.path,
      label: `${buffer.label}${textDocumentText(buffer.editor.document) === buffer.savedText ? '' : ' •'}`,
      closable: true,
      panel: textArea({
        id: `editor:${buffer.path}`,
        presentation: textAreaPresentation(buffer.editor),
        lineNumbers: true,
        activeLine: true,
        scrollbar: { visible: 'auto' },
        onAction: (action): EditorMessage => ({ kind: 'edit', path: buffer.path, action })
      })
    })),
    ...(state.activePath === undefined ? {} : { selected: state.activePath }),
    onAction: (action): EditorMessage => ({ kind: 'tabs', action })
  });
}

function detailsPane(state: EditorState): Element<EditorMessage> {
  const buffer = activeBuffer(state);
  const operation = state.operation.kind === 'idle' ? 'ready' : state.operation.kind;
  return surface(structuredBlock({
    id: 'editor-details-block',
    title: buffer?.label ?? 'No file selected',
    result: state.operation.kind === 'failed' ? 'failed' : state.operation.kind === 'pending' ? 'running' : 'success',
    summary: state.notice,
    fields: [
      { label: 'workspace', value: state.root ?? 'none' },
      { label: 'buffers', value: String(state.buffers.length) },
      { label: 'dirty', value: String(state.buffers.filter(isDirty).length) },
      { label: 'operation', value: operation }
    ]
  }), { id: 'editor-details', appearance: 'inset', padding: 1 });
}

function commandPane(state: EditorState): Element<EditorMessage> {
  return surface(commandInput({
    id: 'editor-command',
    prompt: '› ',
    placeholder: '/open README.md, /folder src, /save, /close',
    presentation: commandInputPresentation(state.command),
    display: state.command.input.text.length === 0 ? 'compact' : 'expanded',
    onAction: (action): EditorMessage => ({ kind: 'command', action }),
    onSubmit: (value): EditorMessage => ({ kind: 'submitCommand', value })
  }), { id: 'editor-command-surface', appearance: 'raised', padding: { left: 1, right: 1 } });
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
  return dialog(commandInput({
    id: 'path-chooser-input',
    prompt: 'Path › ',
    placeholder: chooser.mode === 'folder' ? '/path/to/folder' : '/path/to/file',
    presentation: commandInputPresentation(chooser.command),
    display: 'compact',
    onAction: (action): EditorMessage => ({ kind: 'chooser', action }),
    onSubmit: (value): EditorMessage => ({ kind: 'submitChooser', value })
  }), {
    id: 'path-chooser',
    title: chooser.mode === 'folder' ? 'Open Folder' : 'Open File',
    modal: true,
    focusPolicy: { initialFocus: { kind: 'element', elementId: 'path-chooser-input' }, returnFocus: 'restore' },
    dismissal: { escape: true, outsidePress: true, onDismiss: (): EditorMessage => ({ kind: 'dismissChooser' }) },
    width: 72,
    height: 7,
    padding: 1
  });
}

function updateTabs(state: EditorState, action: TabAction): TuiUpdateResult<EditorState, EditorMessage> {
  if (action.kind === 'close') return result(closeBuffer(state, action.id));
  const selected = tabsReducer(
    state.activePath === undefined ? {} : { selected: state.activePath },
    action,
    state.buffers.map((buffer) => ({ id: buffer.path }))
  ).selected;
  return result(selected === undefined ? state : { ...state, activePath: selected });
}

function openBuffer(state: EditorState, targetPath: string, content: string): EditorState {
  const existing = state.buffers.find((buffer) => buffer.path === targetPath);
  if (existing !== undefined) {
    return { ...state, activePath: targetPath, operation: { kind: 'idle' }, notice: `Selected ${existing.label}` };
  }
  const buffer: EditorBuffer = {
    path: targetPath,
    label: path.basename(targetPath),
    editor: createTextAreaState({
      value: content,
      caret: { position: { offset: 0, affinity: 'downstream' } },
      scroll: createScrollState({ contentRows: lineCount(content), viewportRows: 24 })
    }),
    savedText: content
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
  const buffers = state.buffers.filter((buffer) => buffer.path !== targetPath);
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
  return textDocumentText(buffer.editor.document) !== buffer.savedText;
}

function isCurrentOperation(state: EditorState, id: string): boolean {
  return state.operation.kind === 'pending' && state.operation.id === id;
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

function lineCount(content: string): number {
  return Math.max(1, content.split('\n').length);
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
    await runtime.dispatch({ kind: 'edit', path: planPath, action: { kind: 'edit', operation: { kind: 'insert', text: 'planned: ' } } });
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
      status: 'ok',
      rootOpened: runtime.state().root === fixture,
      activeFile: path.basename(runtime.state().activePath ?? ''),
      savedPlan: (await readFile(planPath, 'utf8')).startsWith('planned: '),
      chooserVisible,
      openBuffers: runtime.state().buffers.length,
      dirtyBuffers: runtime.state().buffers.filter(isDirty).length,
      treeTargets: frame.hitTargets?.filter((target) => target.id.startsWith('editor-tree')).length ?? 0,
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

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const host = createTerminalHost();
    const exit = await runTui(ideEditorApp, host, {
      sessionPolicy: {
        alternateScreen: 'required',
        rawInput: 'required',
        bracketedPaste: 'optional',
        focusReporting: 'optional',
        keyboard: { profile: { kind: 'legacy' }, requirement: 'disabled' },
        cursorVisibility: { state: 'hide', requirement: 'optional' },
        mouseReporting: { mode: 'drag', requirement: 'optional' }
      }
    });
    process.exitCode = exit.status === 'error' ? 1 : 0;
  } else {
    process.stdout.write(`${JSON.stringify(await runScriptedIdeEditor(), null, 2)}\n`);
  }
}
