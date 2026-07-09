import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { createMemoryTerminalHost, createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { editTextAreaBuffer } from '@ismail-elkorchi/terminal-ui/text';
import {
  createTuiRuntime,
  defineTui,
  runTui
} from '@ismail-elkorchi/terminal-ui/tui';
import {
  applyScrollEvent,
  commandBarReducer,
  createScrollState,
  nextTreeRowId,
  paletteReducer,
  scrollReducer,
  selectedPaletteEntry,
  treeReducer,
  visibleTreeRows
} from '@ismail-elkorchi/terminal-ui/behavior';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import {
  grid,
  overlay,
  row,
  stack,
  surface,
  tabs,
  viewport
} from '@ismail-elkorchi/terminal-ui/layout';
import {
  activityIndicator,
  commandBar,
  helpBar,
  menuBar,
  notificationStack,
  palette,
  progressBar,
  statusBar,
  structuredBlock,
  table,
  text,
  textArea,
  tree
} from '@ismail-elkorchi/terminal-ui/components';

const MAX_FILE_BYTES = 256_000;

const commandEntries = Object.freeze([
  {
    id: 'open-path',
    label: 'Open path',
    value: '/open ',
    group: 'File',
    keywords: ['folder', 'file', 'workspace'],
    preview: 'Open a file or folder path relative to the current workspace.'
  },
  {
    id: 'open-folder',
    label: 'Open folder',
    value: '/folder ',
    group: 'File',
    keywords: ['workspace', 'directory'],
    preview: 'Replace the workspace root with a directory.'
  },
  {
    id: 'open-file',
    label: 'Open file',
    value: '/file ',
    group: 'File',
    keywords: ['buffer', 'editor'],
    preview: 'Open a UTF-8 text file in the editor.'
  },
  {
    id: 'save',
    label: 'Save active file',
    value: '/save',
    group: 'File',
    keywords: ['write', 'persist'],
    preview: 'Write the active buffer to disk.'
  },
  {
    id: 'close-buffer',
    label: 'Close active buffer',
    value: '/close',
    group: 'File',
    keywords: ['tab', 'buffer'],
    preview: 'Close the active editor tab.'
  },
  {
    id: 'command-palette',
    label: 'Open command palette',
    value: '/palette',
    group: 'Command',
    keywords: ['commands', 'actions'],
    preview: 'Open this command palette.'
  }
]);

const commandSuggestions = Object.freeze(commandEntries.map((entry) => ({
  value: entry.value,
  label: entry.value,
  description: entry.label
})));

const commandFocusPath = Object.freeze(['ide-root', 'ide-grid', 'ide-command-surface', 'ide-command']);

export const ideEditorApp = defineIdeEditorApp();

export function defineIdeEditorApp(options = {}) {
  const defaultRoot = path.resolve(options.defaultRoot ?? process.cwd());
  return defineTui({
    id: 'ide-editor',
    init: () => initialState(defaultRoot),
    keyBindings: [
      { id: 'exit', keys: ['ctrlC', 'ctrlQ'], label: 'Exit', message: { kind: 'exit' } },
      { id: 'escape-palette', keys: ['escape'], phase: 'beforeFocus', enabled: ({ state }) => state.palette.open, message: { kind: 'closePalette' } }
    ],
    update: updateIde,
    view: ideView,
    nonTty: { mode: 'last_frame' }
  });
}

function initialState(rootPath) {
  const workspace = loadWorkspace(rootPath);
  return {
    rootPath: workspace.rootPath,
    tree: {
      nodes: workspace.nodes,
      selected: workspace.nodes[0]?.id,
      omitted: workspace.omitted
    },
    buffers: {},
    openOrder: [],
    activePath: undefined,
    command: {
      input: { text: '', cursor: 0 },
      history: [],
      suggestions: commandSuggestions
    },
    palette: { open: false, query: '', selectedIndex: 0, used: false },
    notifications: [],
    nextNotificationId: 1,
    log: [
      `Workspace opened: ${workspace.rootPath}`,
      'Use /open <path>, click a file in the tree, edit text, then use File Save or /save.'
    ],
    ticks: 0,
    pointer: { tree: false, menu: false, bufferTable: false }
  };
}

async function updateIde(state, message) {
  switch (message.kind) {
    case 'tick':
      return withState({ ...state, ticks: state.ticks + 1 });
    case 'menu':
      return withState(handleMenu(state, message.action));
    case 'selectTreeNode':
      return withState(selectTreeNode(state, message.id, message.source));
    case 'treeDisclosure':
      return withState(discloseTreeNode(state, message.id, message.source));
    case 'treeMove':
      return withState({ ...state, tree: { ...state.tree, selected: nextVisibleTreeId(state, message.delta) } });
    case 'activateTree':
      return withState(activateSelectedTreeNode(state));
    case 'expandTree':
      return withState(expandSelectedTreeNode(state));
    case 'collapseTree':
      return withState(collapseSelectedTreeNode(state));
    case 'setActiveBuffer':
      return withState(setActiveBuffer({ ...state, pointer: { ...state.pointer, bufferTable: message.source === 'pointer' || state.pointer.bufferTable } }, message.path));
    case 'closeActive':
      return withState(closeActiveBuffer(state));
    case 'closeBuffer':
      return withState(closeBuffer(state, message.path));
    case 'saveActive':
      return withState(saveActiveBuffer(state, message.source));
    case 'editActive':
      return withState(editActiveBuffer(state, message.action));
    case 'scrollActive':
      return withState(scrollActiveBuffer(state, message.event));
    case 'commandEdit':
      return withState({ ...state, command: commandBarReducer(state.command, message.action) });
    case 'submitCommand':
      return withState(applyCommand(state, state.command.input.text));
    case 'openPalette':
      return withState({
        ...state,
        pointer: { ...state.pointer, menu: message.source === 'menu' || state.pointer.menu },
        palette: { ...state.palette, open: true, query: '', selectedIndex: 0 }
      });
    case 'closePalette':
      return withState({ ...state, palette: { ...state.palette, open: false, query: '', selectedIndex: 0 } });
    case 'paletteEdit':
      return withState({
        ...state,
        palette: {
          ...state.palette,
          ...paletteReducer(state.palette, message.action)
        }
      });
    case 'paletteAcceptSelected': {
      const selected = selectedPaletteEntry({ entries: commandEntries, state: state.palette, limit: 7 });
      return withState(selected === undefined ? state : applyCommand(markPaletteUsed(state), selected.value));
    }
    case 'paletteAccept':
      return withState(applyCommand(markPaletteUsed(state), message.command));
    case 'dismissNotification':
      return withState({
        ...state,
        notifications: state.notifications.filter((item) => item.id !== message.id)
      });
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
}

function withState(state) {
  return { state };
}

function ideView(state, context) {
  const workspace = context.viewport.columns >= 108 ? wideIdeView(state, context) : narrowIdeView(state, context);
  return overlay([
    workspace,
    ...(state.palette.open ? [paletteOverlay(state)] : []),
  ], { id: 'ide-root' });
}

function wideIdeView(state, context) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'ide-grid',
    areas: `
      top top top
      explorer editor inspector
      command command command
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }, { kind: 'fixed', cells: commandRows }],
    columns: [{ kind: 'fixed', cells: 31 }, { kind: 'fill' }, { kind: 'fixed', cells: 38 }],
    gap: 1,
    children: {
      top: topChrome(state),
      explorer: explorerPane(state),
      editor: editorWorkspace(state),
      inspector: inspectorPane(state, context),
      command: commandPane(state)
    }
  });
}

function narrowIdeView(state, _context) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'ide-grid',
    areas: `
      top
      editor
      command
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }, { kind: 'fixed', cells: commandRows }],
    columns: [{ kind: 'fill' }],
    gap: 1,
    children: {
      top: topChrome(state),
      editor: editorWorkspace(state),
      command: commandPane(state)
    }
  });
}

function topChrome(state) {
  const active = activeBuffer(state);
  return surface(stack([
    menuBar({
      id: 'ide-menu',
      items: [
        { id: 'open-root', label: 'Open Cwd', onPress: { kind: 'menu', action: 'openCwd' } },
        { id: 'save', label: 'Save', disabled: active === undefined || active.dirty !== true, onPress: { kind: 'saveActive', source: 'menu' } },
        { id: 'close', label: 'Close', disabled: active === undefined, onPress: { kind: 'closeActive' } },
        { id: 'palette', label: 'Palette', onPress: { kind: 'openPalette', source: 'menu' } },
        { id: 'quit', label: 'Quit', onPress: { kind: 'exit' } }
      ],
      selected: 'save'
    }),
    statusBar({
      id: 'ide-status',
      text: `${path.basename(state.rootPath) || state.rootPath} | ${state.openOrder.length} buffer(s) | ${dirtyBuffers(state).length} unsaved | ${state.ticks} tick(s)`
    })
  ], {
    id: 'ide-top-body',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }]
  }), {
    id: 'ide-top',
    variant: 'chrome',
    padding: { left: 1, right: 1 }
  });
}

function notificationStackWidget(state) {
  return notificationStack({
    id: 'ide-notifications',
    items: state.notifications,
    placement: 'bottom-right',
    maxVisible: 3,
    maxWidth: 36,
    onDismiss: (item) => ({ kind: 'dismissNotification', id: item.id })
  });
}

function explorerPane(state) {
  return surface(stack([
    text('Explorer', { id: 'explorer-title', textRole: 'heading' }),
    text(shortPath(state.rootPath, state.rootPath), { id: 'explorer-root', textRole: 'metadata' }),
    tree({
      id: 'ide-tree',
      nodes: state.tree.nodes,
      selected: state.tree.selected,
      scrollbar: { visible: 'auto' },
      onSelect: (node) => ({ kind: 'selectTreeNode', id: node.id, source: 'pointer' }),
      onDisclosure: (node) => ({ kind: 'treeDisclosure', id: node.id, source: 'pointer' }),
      keys: {
        arrowDown: { kind: 'treeMove', delta: 1 },
        arrowUp: { kind: 'treeMove', delta: -1 },
        arrowRight: { kind: 'expandTree' },
        arrowLeft: { kind: 'collapseTree' },
        enter: { kind: 'activateTree' }
      }
    }),
    helpBar({
      id: 'explorer-help',
      bindings: [
        { key: 'click', label: 'select/open file' },
        { key: 'disclosure', label: 'toggle folder' },
        { key: 'enter', label: 'open/toggle' },
        { key: 'left/right', label: 'collapse/expand' },
        { key: 'up/down', label: 'move' }
      ]
    })
  ], {
    id: 'explorer-body',
    gap: 1,
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 2 }
    ]
  }), {
    id: 'explorer-pane',
    label: 'Workspace',
    variant: 'inset',
    padding: 1
  });
}

function editorWorkspace(state) {
  const openBuffers = state.openOrder.map((filePath) => state.buffers[filePath]).filter(Boolean);
  if (openBuffers.length === 0) {
    return surface(notificationLayer(state, welcomePanel(state)), {
      id: 'empty-editor-surface',
      label: 'Editor',
      variant: 'neutral',
      padding: 1
    });
  }
  return tabs({
    id: 'ide-tabs',
    selected: state.activePath,
    tabs: openBuffers.map((buffer) => ({
      id: buffer.path,
      label: buffer.label,
      ...(buffer.dirty ? { badge: '*' } : {}),
      onClose: { kind: 'closeBuffer', path: buffer.path },
      description: buffer.path,
      onSelect: { kind: 'setActiveBuffer', path: buffer.path, source: 'tab' },
      panel: editorPanel(state, buffer)
    })),
    keys: {
      arrowLeft: { kind: 'setActiveBuffer', path: adjacentBufferPath(state, -1), source: 'keyboard' },
      arrowRight: { kind: 'setActiveBuffer', path: adjacentBufferPath(state, 1), source: 'keyboard' }
    }
  });
}

function welcomePanel(state) {
  return stack([
    text('Open a folder or file to start editing.', { id: 'welcome-title', textRole: 'heading' }),
    text('/open <path> opens files and folders relative to the current workspace.', { id: 'welcome-open' }),
    text('/save persists the active text buffer. File-tree clicks open text files.', { id: 'welcome-save' }),
    structuredBlock({
      id: 'welcome-workspace',
      title: 'Current workspace',
      summary: state.rootPath,
      fields: [
        { label: 'Tree nodes', value: String(visibleTreeRows(state.tree.nodes).length) },
        { label: 'Omitted', value: String(state.tree.omitted) }
      ]
    })
  ], {
    id: 'welcome-body',
    gap: 1,
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'content', max: 6 }
    ]
  });
}

function editorPanel(state, buffer) {
  return surface(grid({
    id: 'editor-panel-grid',
    areas: `
      meta
      editor
      footer
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }, { kind: 'fixed', cells: 2 }],
    columns: [{ kind: 'fill' }],
    children: {
      meta: row([
        activityIndicator({
          id: 'editor-state',
          label: buffer.dirty ? 'modified' : 'saved',
          status: buffer.dirty ? 'running' : 'success'
        }),
        progressBar({
          id: 'editor-size',
          label: 'size',
          value: Math.min(buffer.text.length, MAX_FILE_BYTES),
          max: MAX_FILE_BYTES,
          display: 'bar+percent'
        })
      ], { id: 'editor-meta', gap: 2 }),
      editor: notificationLayer(state, textArea({
        id: 'ide-editor-text',
        value: buffer.text,
        cursor: buffer.cursor,
        selection: buffer.selection,
        lineNumbers: { minWidth: 3 },
        activeLine: true,
        scroll: buffer.scroll,
        scrollbar: { visible: 'auto' },
        scrollPolicy: { wheel: { rows: 6, columns: 8 } },
        placeholder: 'Write here...',
        onScroll: (event) => ({ kind: 'scrollActive', event }),
        onInput: (value) => ({ kind: 'editActive', action: { kind: 'insert', text: value } }),
        keys: textAreaKeyMap()
      })),
      footer: helpBar({
        id: 'editor-help',
        bindings: [
          { key: 'text', label: 'edit' },
          { key: 'File Save', label: 'write file' },
          { key: '/close', label: 'close tab' },
          { key: 'Tab', label: 'move focus' }
        ]
      })
    }
  }), {
    id: 'editor-surface',
    label: `${buffer.label}${buffer.dirty ? ' modified' : ''}`,
    variant: 'neutral',
    padding: 1
  });
}

function notificationLayer(state, child) {
  const notifications = state.notifications.length === 0
    ? []
    : [notificationStackWidget(state)];
  return overlay([child, ...notifications], { id: `${child.id ?? 'content'}-notifications` });
}

function inspectorPane(state, context) {
  const active = activeBuffer(state);
  const diagnosticItem = hostInputDiagnostic(context.diagnostics);
  return surface(stack([
    structuredBlock({
      id: 'file-inspector',
      title: active?.label ?? 'No file selected',
      status: diagnosticItem === undefined ? active === undefined ? 'pending' : active.dirty ? 'warning' : 'success' : 'warning',
      summary: active?.label ?? 'Open a file from the tree or command bar.',
      fields: [
        { label: 'Workspace', value: shortPath(state.rootPath, state.rootPath) },
        { label: 'Dirty buffers', value: String(dirtyBuffers(state).length) },
        { label: 'Tree omitted', value: String(state.tree.omitted) },
        { label: 'Lines', value: active === undefined ? '-' : String(lineCount(active.text)) },
        { label: 'Size', value: active === undefined ? '-' : `${String(active.text.length)} chars` },
        ...(diagnosticItem === undefined ? [] : [{ label: 'Host input', value: diagnosticLabel(diagnosticItem) }])
      ],
      body: diagnosticItem?.message ?? latestLogLine(state)
    }),
    table({
      id: 'buffer-table',
      rows: state.openOrder.map((filePath) => {
        const buffer = state.buffers[filePath];
        return [
          buffer?.dirty === true ? '*' : ' ',
          buffer?.label ?? path.basename(filePath),
          buffer === undefined ? 'missing' : `${String(lineCount(buffer.text))} lines`
        ];
      }),
      selected: Math.max(0, state.openOrder.indexOf(state.activePath ?? '')),
      emptyText: 'No open buffers',
      stickyHeader: true,
      columns: [
        { header: '', width: { kind: 'fixed', cells: 2 } },
        { header: 'Buffer', width: { kind: 'fill' } },
        { header: 'Size', width: { kind: 'fixed', cells: 10 } }
      ],
      onSelect: ({ rowIndex }) => ({ kind: 'setActiveBuffer', path: state.openOrder[rowIndex] ?? state.activePath ?? '', source: 'pointer' })
    }),
    viewport(stack(state.log.map((line, index) => text(`${String(index + 1).padStart(2, '0')} ${line}`, {
      id: `ide-log-${String(index)}`
    })), { id: 'ide-log-lines', gap: 0 }), {
      id: 'ide-log',
      contentRows: state.log.length,
      scrollbar: { visible: 'auto' }
    })
  ], {
    id: 'inspector-body',
    gap: 1,
    sizes: [
      { kind: 'content', max: 9 },
      { kind: 'content', max: 7 },
      { kind: 'fill' }
    ]
  }), {
    id: 'inspector-pane',
    label: 'Context',
    variant: 'inset',
    padding: 1
  });
}

function hostInputDiagnostic(diagnostics) {
  return diagnostics.find((item) =>
    (item.code === 'HOST_PROTOCOL_SKIPPED' || item.code === 'HOST_PROTOCOL_UNSUPPORTED')
    && (item.data?.operation === 'mouseReporting' || item.data?.operation === 'focusReporting' || item.data?.operation === 'bracketedPaste')
  );
}

function diagnosticLabel(item) {
  const operation = typeof item.data?.operation === 'string' ? item.data.operation : 'protocol';
  const target = typeof item.data?.target === 'string' ? item.data.target : item.target ?? item.code;
  return `${operation}:${target}`;
}

function commandPane(state) {
  const expanded = commandBarExpanded(state);
  return surface(commandBar({
    id: 'ide-command',
    prompt: '› ',
    value: state.command.input.text,
    cursor: state.command.input.cursor,
    placeholder: 'Type /open, /folder, /save, /palette',
    suggestions: expanded ? state.command.suggestions : [],
    selectedSuggestion: state.command.selectedSuggestion,
    completionPreview: expanded ? completionPreview(state.command.input.text) : undefined,
    footer: expanded ? 'Enter run | arrows suggestions | Esc clear | Tab focus | Ctrl+C/Ctrl+Q exit' : undefined,
    display: expanded ? 'expanded' : 'compact',
    onInput: (value) => ({ kind: 'commandEdit', action: { kind: 'insert', text: value } }),
    keys: {
      backspace: { kind: 'commandEdit', action: { kind: 'deleteBackward' } },
      delete: { kind: 'commandEdit', action: { kind: 'deleteForward' } },
      arrowLeft: { kind: 'commandEdit', action: { kind: 'moveLeft' } },
      arrowRight: { kind: 'commandEdit', action: { kind: 'moveRight' } },
      arrowUp: { kind: 'commandEdit', action: { kind: 'selectSuggestion', direction: -1 } },
      arrowDown: { kind: 'commandEdit', action: { kind: 'selectSuggestion', direction: 1 } },
      enter: { kind: 'submitCommand' },
      escape: { kind: 'commandEdit', action: { kind: 'setValue', value: '' } }
    }
  }), {
    id: 'ide-command-surface',
    label: 'Command',
    variant: 'inset',
    padding: { left: 1, right: 1 }
  });
}

function paletteOverlay(state) {
  return surface(palette({
    id: 'ide-palette',
    title: 'Editor commands',
    entries: commandEntries,
    query: state.palette.query,
    selected: state.palette.selectedIndex,
    maxVisible: 7,
    helpText: 'Type to filter. Enter accepts. Esc closes.',
    onSelect: (entry) => ({ kind: 'paletteAccept', command: entry.value }),
    onInput: (value) => ({ kind: 'paletteEdit', action: { kind: 'insertQuery', text: value } }),
    keys: {
      backspace: { kind: 'paletteEdit', action: { kind: 'deleteQueryBackward' } },
      arrowDown: { kind: 'paletteEdit', action: { kind: 'moveFilteredSelection', delta: 1, entries: commandEntries } },
      arrowUp: { kind: 'paletteEdit', action: { kind: 'moveFilteredSelection', delta: -1, entries: commandEntries } },
      enter: { kind: 'paletteAcceptSelected' },
      escape: { kind: 'closePalette' }
    }
  }), {
    id: 'ide-palette-surface',
    label: 'Command palette',
    variant: 'raised',
    shadow: true,
    padding: 1,
    margin: { top: 4, left: 20, right: 20, bottom: 6 },
    meta: {
      layer: { zIndex: 20 },
      focus: { scope: 'contain' }
    }
  });
}

function textAreaKeyMap() {
  return {
    enter: { kind: 'editActive', action: { kind: 'insert', text: '\n' } },
    backspace: { kind: 'editActive', action: { kind: 'deleteBackward' } },
    delete: { kind: 'editActive', action: { kind: 'deleteForward' } },
    arrowLeft: { kind: 'editActive', action: { kind: 'moveLeft' } },
    arrowRight: { kind: 'editActive', action: { kind: 'moveRight' } },
    arrowUp: { kind: 'editActive', action: { kind: 'moveLineUp' } },
    arrowDown: { kind: 'editActive', action: { kind: 'moveLineDown' } },
    home: { kind: 'editActive', action: { kind: 'moveHome' } },
    end: { kind: 'editActive', action: { kind: 'moveEnd' } },
    pageUp: { kind: 'editActive', action: { kind: 'movePageUp' } },
    pageDown: { kind: 'editActive', action: { kind: 'movePageDown' } }
  };
}

function handleMenu(state, action) {
  switch (action) {
    case 'openCwd':
      return openFolder(state, process.cwd(), 'menu');
  }
}

function selectTreeNode(state, id, source) {
  const node = findTreeNode(state.tree.nodes, id);
  const selectedState = {
    ...state,
    tree: { ...state.tree, selected: id },
    pointer: { ...state.pointer, tree: source === 'pointer' || state.pointer.tree }
  };
  if (node?.metadata?.kind === 'file' && typeof node.metadata.path === 'string') {
    return openFile(selectedState, node.metadata.path, source);
  }
  return {
    ...selectedState,
    log: appendLog(selectedState, `Selected ${node?.label ?? id}.`)
  };
}

function discloseTreeNode(state, id, source) {
  const node = findTreeNode(state.tree.nodes, id);
  const selectedState = {
    ...state,
    tree: { ...state.tree, selected: id },
    pointer: { ...state.pointer, tree: source === 'pointer' || state.pointer.tree }
  };
  if (node?.metadata?.kind !== 'directory' || typeof node.metadata.path !== 'string') return selectedState;
  return toggleDirectoryNode(selectedState, node, source);
}

function activateSelectedTreeNode(state) {
  const id = state.tree.selected;
  if (id === undefined) return state;
  const node = findTreeNode(state.tree.nodes, id);
  if (node?.metadata?.kind === 'directory' && typeof node.metadata.path === 'string') {
    return toggleDirectoryNode(state, node, 'tree');
  }
  if (node?.metadata?.kind === 'file' && typeof node.metadata.path === 'string') {
    return openFile(state, node.metadata.path, 'tree');
  }
  return state;
}

function expandSelectedTreeNode(state) {
  const id = state.tree.selected;
  if (id === undefined) return state;
  const node = findTreeNode(state.tree.nodes, id);
  return node === undefined || node.expanded === true ? state : expandDirectoryNode(state, node, 'keyboard');
}

function collapseSelectedTreeNode(state) {
  const id = state.tree.selected;
  if (id === undefined) return state;
  const node = findTreeNode(state.tree.nodes, id);
  if (node?.metadata?.kind !== 'directory') return state;
  if (node.expanded !== true) return state;
  return {
    ...state,
    tree: {
      ...state.tree,
      nodes: treeReducer(state.tree.nodes, { kind: 'collapse', id: node.id })
    },
    log: appendLog(state, `Collapsed folder: ${shortPath(state.rootPath, String(node.metadata.path ?? node.label))}`)
  };
}

function toggleDirectoryNode(state, node, source) {
  if (node.expanded === true) {
    return {
      ...state,
      tree: {
        ...state.tree,
        nodes: treeReducer(state.tree.nodes, { kind: 'collapse', id: node.id })
      },
      log: appendLog(state, `Collapsed folder from ${source}: ${shortPath(state.rootPath, String(node.metadata.path ?? node.label))}`)
    };
  }
  return expandDirectoryNode(state, node, source);
}

function expandDirectoryNode(state, node, source) {
  if (node.metadata?.kind !== 'directory' || typeof node.metadata.path !== 'string') return state;
  if (node.children !== undefined && node.lazy !== true) {
    return {
      ...state,
      tree: {
        ...state.tree,
        nodes: treeReducer(state.tree.nodes, { kind: 'expand', id: node.id })
      },
      log: appendLog(state, `Expanded folder from ${source}: ${shortPath(state.rootPath, node.metadata.path)}`)
    };
  }
  try {
    const loaded = directoryChildren(state.rootPath, node.metadata.path);
    return {
      ...state,
      tree: {
        ...state.tree,
        nodes: treeReducer(state.tree.nodes, { kind: 'lazySuccess', id: node.id, children: loaded.nodes }),
        omitted: state.tree.omitted + loaded.omitted
      },
      log: appendLog(state, `Loaded folder from ${source}: ${shortPath(state.rootPath, node.metadata.path)}`)
    };
  } catch (error) {
    return {
      ...state,
      tree: {
        ...state.tree,
        nodes: treeReducer(state.tree.nodes, { kind: 'lazyError', id: node.id, message: errorMessage(error) }),
        omitted: state.tree.omitted + 1
      },
      ...notificationPatch(state, 'Folder load failed', errorMessage(error), 'error'),
      log: appendLog(state, `Folder load failed: ${errorMessage(error)}`)
    };
  }
}

function applyCommand(state, rawCommand) {
  const command = rawCommand.trim();
  const withHistory = {
    ...state,
    command: {
      input: { text: '', cursor: 0 },
      history: command.length === 0 ? state.command.history : [...state.command.history, command],
      suggestions: commandSuggestions
    },
    palette: { ...state.palette, open: false, query: '', selectedIndex: 0 }
  };
  if (command.length === 0) return withHistory;
  if (command === '/palette') return { ...withHistory, palette: { ...withHistory.palette, open: true } };
  if (command === '/save') return saveActiveBuffer(withHistory, 'command');
  if (command === '/close') return closeActiveBuffer(withHistory);
  if (command.startsWith('/open ')) return openPath(withHistory, command.slice('/open '.length), 'command');
  if (command.startsWith('/folder ')) return openFolder(withHistory, resolveUserPath(withHistory.rootPath, command.slice('/folder '.length)), 'command');
  if (command.startsWith('/file ')) return openFile(withHistory, resolveUserPath(withHistory.rootPath, command.slice('/file '.length)), 'command');
  return {
    ...withHistory,
    ...notificationPatch(withHistory, 'Unknown command', command, 'warning'),
    log: appendLog(withHistory, `Unknown command ignored: ${command}`)
  };
}

function openPath(state, input, source) {
  const target = resolveUserPath(state.rootPath, input);
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) return openFolder(state, target, source);
    if (stat.isFile()) return openFile(state, target, source);
    return notifyState(state, 'Unsupported path', target, 'warning');
  } catch (error) {
    return notifyState(state, 'Open failed', errorMessage(error), 'error');
  }
}

function openFolder(state, folderPath, source) {
  try {
    const workspace = loadWorkspace(folderPath);
    return {
      ...state,
      rootPath: workspace.rootPath,
      tree: {
        nodes: workspace.nodes,
        selected: workspace.nodes[0]?.id,
        omitted: workspace.omitted
      },
      ...notificationPatch(state, 'Folder opened', workspace.rootPath, 'success'),
      log: appendLog(state, `Opened folder from ${source}: ${workspace.rootPath}`)
    };
  } catch (error) {
    return notifyState(state, 'Open folder failed', errorMessage(error), 'error');
  }
}

function openFile(state, filePath, source) {
  const absolutePath = path.resolve(filePath);
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) return notifyState(state, 'Not a file', absolutePath, 'warning');
    if (stat.size > MAX_FILE_BYTES) return notifyState(state, 'File too large', `${absolutePath} is ${String(stat.size)} bytes`, 'warning');
    const bytes = fs.readFileSync(absolutePath);
    if (isProbablyBinary(bytes)) return notifyState(state, 'Binary file skipped', absolutePath, 'warning');
    const textValue = bytes.toString('utf8');
    const existing = state.buffers[absolutePath];
    const buffer = existing ?? {
      path: absolutePath,
      label: shortPath(state.rootPath, absolutePath),
      text: textValue,
      cursor: 0,
      selection: undefined,
      scroll: textScrollState(textValue),
      dirty: false,
      savedSha: contentFingerprint(textValue)
    };
    const openOrder = state.openOrder.includes(absolutePath) ? state.openOrder : [...state.openOrder, absolutePath];
    return {
      ...state,
      buffers: { ...state.buffers, [absolutePath]: buffer },
      openOrder,
      activePath: absolutePath,
      ...notificationPatch(state, 'File opened', buffer.label, 'success'),
      log: appendLog(state, `Opened file from ${source}: ${buffer.label}`)
    };
  } catch (error) {
    return notifyState(state, 'Open file failed', errorMessage(error), 'error');
  }
}

function editActiveBuffer(state, action) {
  const active = activeBuffer(state);
  if (active === undefined) return state;
  const next = editTextAreaBuffer({
    text: active.text,
    cursor: active.cursor,
    ...(active.selection === undefined ? {} : { selection: active.selection })
  }, action);
  const changed = next.text !== active.text || next.cursor !== active.cursor || !sameSelection(next.selection, active.selection);
  if (!changed) return state;
  const updated = {
    ...active,
    text: next.text,
    cursor: next.cursor,
    scroll: scrollReducer(active.scroll, {
      kind: 'setContent',
      rows: lineCount(next.text),
      columns: maxLineCells(next.text)
    }),
    ...(next.selection === undefined ? { selection: undefined } : { selection: next.selection }),
    dirty: contentFingerprint(next.text) !== active.savedSha
  };
  return {
    ...state,
    buffers: { ...state.buffers, [active.path]: updated }
  };
}

function scrollActiveBuffer(state, event) {
  const active = activeBuffer(state);
  if (active === undefined) return state;
  const scroll = applyScrollEvent(active.scroll, event);
  if (scroll === active.scroll) return state;
  const updated = {
    ...active,
    scroll
  };
  return {
    ...state,
    buffers: { ...state.buffers, [active.path]: updated }
  };
}

function saveActiveBuffer(state, source) {
  const active = activeBuffer(state);
  if (active === undefined) return notifyState(state, 'Nothing to save', 'Open or select a file first.', 'warning');
  try {
    fs.writeFileSync(active.path, active.text, 'utf8');
    const updated = { ...active, dirty: false, savedSha: contentFingerprint(active.text) };
    return {
      ...state,
      pointer: { ...state.pointer, menu: source === 'menu' || state.pointer.menu },
      buffers: { ...state.buffers, [active.path]: updated },
      ...notificationPatch(state, 'Saved', active.label, 'success'),
      log: appendLog(state, `Saved from ${source}: ${active.label}`)
    };
  } catch (error) {
    return notifyState(state, 'Save failed', errorMessage(error), 'error');
  }
}

function closeActiveBuffer(state) {
  const active = activeBuffer(state);
  return active === undefined ? state : closeBuffer(state, active.path);
}

function closeBuffer(state, filePath) {
  const buffer = state.buffers[filePath];
  if (buffer === undefined) return state;
  const remainingOrder = state.openOrder.filter((currentPath) => currentPath !== buffer.path);
  const { [buffer.path]: _closed, ...buffers } = state.buffers;
  return {
    ...state,
    buffers,
    openOrder: remainingOrder,
    activePath: state.activePath === buffer.path ? remainingOrder[0] : state.activePath,
    ...notificationPatch(state, 'Closed buffer', buffer.label, buffer.dirty ? 'warning' : 'info'),
    log: appendLog(state, `Closed buffer: ${buffer.label}`)
  };
}

function setActiveBuffer(state, filePath) {
  if (filePath.length === 0 || state.buffers[filePath] === undefined) return state;
  return {
    ...state,
    activePath: filePath,
    log: appendLog(state, `Selected buffer: ${state.buffers[filePath].label}`)
  };
}

function activeBuffer(state) {
  return state.activePath === undefined ? undefined : state.buffers[state.activePath];
}

function adjacentBufferPath(state, delta) {
  if (state.openOrder.length === 0) return state.activePath ?? '';
  const current = Math.max(0, state.openOrder.indexOf(state.activePath ?? state.openOrder[0]));
  return state.openOrder[wrapIndex(current + delta, state.openOrder.length)] ?? state.activePath ?? '';
}

function loadWorkspace(inputPath) {
  const rootPath = fs.realpathSync(path.resolve(inputPath));
  const stat = fs.statSync(rootPath);
  if (!stat.isDirectory()) throw new Error(`${rootPath} is not a directory`);
  const loaded = directoryChildren(rootPath, rootPath);
  return {
    rootPath,
    nodes: [directoryNode(rootPath, rootPath, true, loaded.nodes)],
    omitted: loaded.omitted
  };
}

function directoryNode(rootPath, directoryPath, expanded = false, children) {
  return {
    id: nodeId('dir', directoryPath),
    label: path.basename(directoryPath) || directoryPath,
    description: shortPath(rootPath, directoryPath),
    icon: '▣',
    expanded,
    lazy: expanded !== true,
    metadata: { kind: 'directory', path: directoryPath },
    ...(children === undefined ? {} : { children })
  };
}

function directoryChildren(rootPath, directoryPath) {
  let entries;
  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (_error) {
    return {
      omitted: 1,
      nodes: [{
        id: `${nodeId('dir', directoryPath)}:unreadable`,
        label: 'unreadable',
        disabled: true,
        metadata: { kind: 'status', path: directoryPath }
      }]
    };
  }
  const sorted = entries
    .filter((entry) => entry.name !== '.' && entry.name !== '..')
    .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
  let omitted = 0;
  const nodes = sorted.flatMap((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) return [directoryNode(rootPath, absolutePath)];
    if (entry.isFile()) {
      return [{
        id: nodeId('file', absolutePath),
        label: entry.name,
        icon: '•',
        description: shortPath(rootPath, absolutePath),
        metadata: { kind: 'file', path: absolutePath }
      }];
    }
    omitted += 1;
    return [];
  });
  return { nodes, omitted };
}

function findTreeNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findTreeNode(node.children ?? [], id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function nextVisibleTreeId(state, delta) {
  return nextTreeRowId(visibleTreeRows(state.tree.nodes), state.tree.selected, delta);
}

function nodeId(kind, absolutePath) {
  return `${kind}:${absolutePath}`;
}

function resolveUserPath(basePath, value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return basePath;
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.resolve(os.homedir(), trimmed.slice(2));
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(basePath, trimmed);
}

function shortPath(rootPath, filePath) {
  const relative = path.relative(rootPath, filePath);
  return relative.length === 0 ? path.basename(rootPath) || rootPath : relative;
}

function dirtyBuffers(state) {
  return state.openOrder.map((filePath) => state.buffers[filePath]).filter((buffer) => buffer?.dirty === true);
}

function latestLogLine(state) {
  return state.log.at(-1) ?? 'No activity yet.';
}

function lineCount(value) {
  if (value.length === 0) return 0;
  return value.split('\n').length;
}

function maxLineCells(value) {
  return value.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
}

function textScrollState(value) {
  return createScrollState({
    contentRows: lineCount(value),
    contentColumns: maxLineCells(value),
    viewportRows: 1,
    viewportColumns: 1
  });
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function notifyState(state, title, message, tone) {
  return {
    ...state,
    ...notificationPatch(state, title, message, tone),
    log: appendLog(state, `${title}: ${message}`)
  };
}

function notificationPatch(state, title, message, tone) {
  return {
    nextNotificationId: state.nextNotificationId + 1,
    notifications: [
      ...state.notifications,
      {
        id: `ide-notice-${String(state.nextNotificationId)}`,
        title,
        message,
        tone
      }
    ]
  };
}

function appendLog(state, line) {
  return [...state.log, line].slice(-18);
}

function completionPreview(value) {
  if (value.length === 0) return undefined;
  const suggestion = commandSuggestions.find((item) => item.value.startsWith(value) && item.value !== value);
  return suggestion === undefined ? undefined : suggestion.value.slice(value.length);
}

function commandBarExpanded(state) {
  return state.command.input.text.length > 0 || state.command.selectedSuggestion !== undefined;
}

function commandRowCount(state) {
  return commandBarExpanded(state) ? 6 : 3;
}

function markPaletteUsed(state) {
  return { ...state, palette: { ...state.palette, used: true } };
}

function sameSelection(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return left.start === right.start && left.end === right.end;
}

function contentFingerprint(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(16);
}

function wrapIndex(index, count) {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runScriptedIdeEditor() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-ui-ide-'));
  const notesDir = path.join(root, 'notes');
  fs.mkdirSync(notesDir);
  const readmePath = path.join(notesDir, 'readme.txt');
  const planPath = path.join(root, 'plan.md');
  fs.writeFileSync(readmePath, 'Terminal UI IDE example\n\n- Open files\n- Edit buffers\n', 'utf8');
  fs.writeFileSync(planPath, '# Plan\n\nUse the tree and command bar together.\n', 'utf8');

  const host = createMemoryTerminalHost({ viewport: { columns: 126, rows: 34 } });
  const runtime = createTuiRuntime({
    app: defineIdeEditorApp({ defaultRoot: root }),
    host,
    initialFocusPath: commandFocusPath
  });

  try {
    await runtime.start();
    await runtime.handleInput({ kind: 'text', text: '/open notes/readme.txt' });
    await runtime.handleInput(keyEvent('enter'));
    await focusUntil(runtime, 'ide-editor-text');
    await runtime.handleInput(keyEvent('end'));
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: 'Edited from scripted IDE.' });

    const saveTarget = targetById(runtime, 'ide-menu:save');
    await click(runtime, saveTarget);

    const notesTarget = targetById(runtime, `ide-tree:${nodeId('dir', notesDir)}:disclosure`);
    await click(runtime, notesTarget);
    const notesExpanded = findTreeNode(runtime.getState().tree.nodes, nodeId('dir', notesDir))?.expanded === true;
    const readmeVisible = runtime.frame()?.hitTargets?.some((target) => target.id === `ide-tree:${nodeId('file', readmePath)}:body`) === true;
    const readmeTarget = targetById(runtime, `ide-tree:${nodeId('file', readmePath)}:body`);
    await click(runtime, readmeTarget);

    const planTarget = targetById(runtime, `ide-tree:${nodeId('file', planPath)}:body`);
    await click(runtime, planTarget);

    const paletteTarget = targetById(runtime, 'ide-menu:palette');
    await click(runtime, paletteTarget);
    await runtime.handleInput({ kind: 'text', text: 'save' });
    const paletteQuery = runtime.getState().palette.query;

    const frame = runtime.frame();
    const state = runtime.getState();
    return {
      status: 'ok',
      frames: host.frames().length,
      rootOpened: state.rootPath === root,
      activeFile: state.activePath === planPath ? 'plan.md' : path.basename(state.activePath ?? ''),
      savedReadme: fs.readFileSync(readmePath, 'utf8').includes('Edited from scripted IDE.'),
      openBuffers: state.openOrder.length,
      dirtyBuffers: dirtyBuffers(state).length,
      paletteQuery,
      notesExpanded,
      readmeVisible,
      pointerTree: state.pointer.tree,
      pointerMenu: state.pointer.menu,
      treeTargets: frame?.hitTargets?.filter((target) => target.id.startsWith('ide-tree:')).length ?? 0,
      menuTargets: frame?.hitTargets?.filter((target) => target.id.startsWith('ide-menu:')).length ?? 0,
      visible: renderFramePlain(frame).includes('Editor commands'),
      outputRows: renderFramePlain(frame).split('\n').length
    };
  } finally {
    await runtime.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function focusUntil(runtime, id, limit = 12) {
  for (let index = 0; index < limit; index += 1) {
    const focusPath = runtime.frame()?.focusPath ?? [];
    if (focusPath.includes(id)) return;
    await runtime.handleInput(keyEvent('tab'));
  }
  throw new Error(`Could not focus ${id}`);
}

function targetById(runtime, id) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

async function click(runtime, target) {
  await runtime.handleInput(mouseEvent('press', target, 'left'));
  await runtime.handleInput(mouseEvent('release', target, 'none'));
}

function mouseEvent(action, target, button) {
  return {
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action,
    button,
    row: target.bounds.row,
    column: target.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  };
}

function keyEvent(key) {
  return {
    kind: 'key',
    key,
    sequence: '',
    modifiers: { shift: false, alt: false, ctrl: false }
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true && !process.argv.includes('--scripted')) {
    const exit = await runTui(ideEditorApp, createTerminalHost({ runtime: 'node' }), {
      initialFocusPath: commandFocusPath
    });
    if (exit.status !== 'completed') {
      process.exitCode = 1;
    }
  } else {
    const result = await runScriptedIdeEditor();
    console.log(JSON.stringify(result));
  }
}
