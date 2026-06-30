import { clipTextCells, editTextBuffer } from '@ismail-elkorchi/terminal-ui/text';
import {
  activityFeedReducer,
  paletteReducer,
  scrollbackReducer,
  tableReducer,
  treeStateReducer
} from '@ismail-elkorchi/terminal-ui/widgets';

import { activityBlocks, commandEntries, dataRows } from './data.mjs';
import { nextThemeState, themeIndexFor } from './theme.mjs';
import {
  clamp,
  commandQueryCells,
  overlayLabel,
  quickActions,
  routeForNode,
  routeLabel,
  selectedActivityBlock,
  selectedVessel
} from './state.mjs';

export function updateShowcase(state, message) {
  switch (message.kind) {
    case 'route':
      return { state: routeState(state, message.route, `Opened ${routeLabel(message.route)}.`) };
    case 'inspector':
      return { state: { ...state, selectedInspector: message.inspector, lastAction: `Inspector focused ${message.inspector}.` } };
    case 'palette':
      return { state: { ...state, paletteOpen: message.open, modalOpen: false, contextMenuOpen: false, lastAction: message.open ? 'Command palette opened over the operations floor.' : 'Command palette closed.' } };
    case 'paletteMove':
      return { state: updatePaletteState(state, { kind: 'moveSelection', delta: message.delta, entryCount: commandEntries.length }) };
    case 'palettePick':
      return { state: applyPaletteEntry(state, commandEntries[state.paletteState.selectedIndex]) };
    case 'modal':
      return { state: { ...state, modalOpen: message.open, paletteOpen: false, contextMenuOpen: false, lastAction: message.open ? 'Shift handoff wizard opened.' : 'Shift handoff wizard closed.' } };
    case 'context':
      return { state: { ...state, contextMenuOpen: message.open, paletteOpen: false, modalOpen: false, lastAction: message.open ? 'Context actions opened for the active route.' : 'Context actions closed.' } };
    case 'dropdown':
      return { state: { ...state, dropdownOpen: message.open, lastAction: message.open ? 'Theme menu opened.' : 'Theme menu closed.' } };
    case 'theme':
      return { state: nextThemeState(state) };
    case 'setTheme':
      return { state: { ...state, themeIndex: themeIndexFor(message.value), dropdownOpen: false, lastAction: `Theme changed to ${message.value}; every panel retinted.` } };
    case 'layoutMode':
      return { state: { ...state, layoutMode: message.value, density: densityForLayoutMode(message.value, state.density), lastAction: `Layout mode set to ${message.value}; panel proportions changed.` } };
    case 'density':
      return { state: { ...state, density: clamp(message.value, 1, 5), lastAction: `Density set to ${String(clamp(message.value, 1, 5))}; dashboard spacing updated.` } };
    case 'toggleMouse':
      return { state: { ...state, mouseEnabled: !state.mouseEnabled, lastAction: `Mouse targets ${state.mouseEnabled ? 'disabled' : 'enabled'}; hit affordances updated.` } };
    case 'tick':
      return {
        state: {
          ...state,
          spinnerFrame: state.spinnerFrame + 1,
          progress: state.progress >= 100 ? 68 : Math.min(100, state.progress + 2)
        }
      };
    case 'row':
      return { state: selectFleetRow(state, message.row) };
    case 'activity':
      return { state: selectActivity(state, message.index) };
    case 'activityNext':
      return { state: updateActivityState(state, { kind: 'selectNext' }) };
    case 'activityPrevious':
      return { state: updateActivityState(state, { kind: 'selectPrevious' }) };
    case 'quick':
      return { state: { ...state, selectedQuickAction: clamp(message.index, 0, quickActions.length - 1), lastAction: `Quick action highlighted: ${quickActions[clamp(message.index, 0, quickActions.length - 1)]}.` } };
    case 'quickPick':
      return { state: applyQuickAction(state, quickActions[state.selectedQuickAction] ?? 'Palette') };
    case 'navFilter':
      return { state: filterNavigation(state, message.value) };
    case 'navFilterText':
      return { state: filterNavigation(state, editTextAtEnd(state.navFilter, { kind: 'insert', text: message.text }).text) };
    case 'command':
      return { state: commandState(state, message.value, clamp(message.cursor ?? message.value.length, 0, message.value.length), 'Command edited.') };
    case 'commandText':
      return { state: editCommand(state, { kind: 'insert', text: message.text }) };
    case 'commandBackspace':
      return { state: editCommand(state, { kind: 'deleteBackward' }) };
    case 'commandDelete':
      return { state: editCommand(state, { kind: 'deleteForward' }) };
    case 'commandMove':
      return { state: editCommand(state, message.delta < 0 ? { kind: 'moveLeft' } : { kind: 'moveRight' }) };
    case 'commandHome':
      return { state: editCommand(state, { kind: 'moveHome' }) };
    case 'commandEnd':
      return { state: editCommand(state, { kind: 'moveEnd' }) };
    case 'submitCommand':
      return { state: runCommand(state) };
    case 'draftText':
      return { state: editDraftText(state, { kind: 'insert', text: message.text }) };
    case 'draftBackspace':
      return { state: editDraftText(state, { kind: 'deleteBackward' }) };
    case 'scrollbackSearch':
      return { state: updateScrollbackState(state, { kind: 'setSearchQuery', query: message.query }) };
    case 'escape':
      return { state: { ...state, paletteOpen: false, modalOpen: false, contextMenuOpen: false, dropdownOpen: false, lastAction: 'Transient UI cleared; operations floor restored.' } };
    case 'exit':
      return { state, exit: { reason: 'showcase-complete' } };
    default:
      return { state };
  }
}

function selectFleetRow(state, row) {
  const fleetTable = tableReducer(state.fleetTable, { kind: 'selectRow', row }, { rowCount: dataRows.length, columnCount: 4 });
  const next = {
    ...state,
    fleetTable,
    selectedInspector: 'vessel'
  };
  const vessel = selectedVessel(next);
  return {
    ...next,
    lastAction: `${vessel.name} selected; map, route board, and inspector updated.`
  };
}

function selectActivity(state, index) {
  return updateActivityState(state, { kind: 'select', index });
}

function updateActivityState(state, action) {
  const activityState = activityFeedReducer(state.activityState, action, { blocks: activityBlocks });
  const next = { ...state, activityState, selectedInspector: 'event' };
  return {
    ...next,
    lastAction: `Event selected: ${selectedActivityBlock(next).title}.`
  };
}

function updatePaletteState(state, action) {
  const paletteState = paletteReducer(state.paletteState, action);
  return {
    ...state,
    paletteState,
    selectedPalette: paletteState.selectedIndex,
    lastAction: `Palette highlighted ${commandEntries[paletteState.selectedIndex]?.label ?? 'command'}.`
  };
}

function updateScrollbackState(state, action) {
  const scrollbackState = scrollbackReducer(state.scrollbackState, action);
  return {
    ...state,
    scrollbackState,
    lastAction: scrollbackState.searchQuery === undefined ? 'Event search cleared.' : `Event search narrowed to "${scrollbackState.searchQuery}".`
  };
}

function filterNavigation(state, value) {
  const navState = treeStateReducer(state.navState, { kind: 'filter', query: value });
  return {
    ...state,
    navFilter: value,
    navState,
    commandQuery: cellPreview(value),
    lastAction: value.length === 0 ? 'Navigation filter cleared.' : `Navigation filtered by "${value}".`
  };
}

function routeState(state, route, lastAction) {
  return {
    ...state,
    selectedRoute: route,
    selectedNavigation: route,
    navState: treeStateReducer(state.navState, { kind: 'select', id: route }),
    paletteOpen: false,
    contextMenuOpen: false,
    modalOpen: false,
    lastAction
  };
}

function applyQuickAction(state, value) {
  if (value === 'Palette') return { ...state, paletteOpen: true, modalOpen: false, contextMenuOpen: false, lastAction: 'Command palette opened from quick actions.' };
  if (value === 'Handoff') return { ...state, modalOpen: true, paletteOpen: false, contextMenuOpen: false, lastAction: 'Handoff wizard opened from quick actions.' };
  if (value === 'Context') return { ...state, contextMenuOpen: true, paletteOpen: false, modalOpen: false, lastAction: 'Context actions opened from quick actions.' };
  return nextThemeState(state);
}

function applyPaletteEntry(state, entry) {
  if (entry === undefined) return { ...state, paletteOpen: false, lastAction: 'No palette entry selected.' };
  if (entry.id === 'theme') return nextThemeState({ ...state, paletteOpen: false });
  if (entry.id === 'modal') return { ...state, paletteOpen: false, modalOpen: true, contextMenuOpen: false, lastAction: 'Palette opened the handoff wizard.' };
  const route = routeForNode(entry.id);
  return routeState(state, route, `Palette opened ${routeLabel(route)}.`);
}

function editCommand(state, action) {
  const next = editTextBuffer(
    { text: state.commandValue, cursor: clamp(state.commandCursor, 0, state.commandValue.length) },
    action
  );
  return commandState(state, next.text, next.cursor, 'Command edited.');
}

function editDraftText(state, action) {
  const next = editTextAtEnd(state.draftText, action);
  return { ...state, draftText: next.text, lastAction: 'Briefing draft updated.' };
}

function editTextAtEnd(textValue, action) {
  return editTextBuffer({ text: textValue, cursor: textValue.length }, action);
}

function commandState(state, value, cursor, lastAction) {
  const commandQuery = cellPreview(value.replace(/^\/+/u, ''));
  return {
    ...state,
    commandValue: value,
    commandCursor: cursor,
    commandQuery,
    paletteState: paletteReducer(state.paletteState, { kind: 'setQuery', query: commandQuery }),
    lastAction
  };
}

function runCommand(state) {
  const command = state.commandValue.trim();
  if (command.length === 0 || command === '/palette') {
    return { ...commandState(state, command, command.length, 'Command opened the palette.'), paletteOpen: true, modalOpen: false, contextMenuOpen: false };
  }
  if (command === '/theme') return clearCommand(nextThemeState(state));
  if (command === '/handoff' || command === '/wizard') return clearCommand({ ...state, modalOpen: true, paletteOpen: false, contextMenuOpen: false, lastAction: 'Command opened the handoff wizard.' });
  if (command === '/context') return clearCommand({ ...state, contextMenuOpen: true, paletteOpen: false, modalOpen: false, lastAction: 'Command opened contextual route actions.' });
  const route = routeCommand(command);
  if (route !== undefined) return clearCommand(routeState(state, route, `Command opened ${routeLabel(route)}.`));
  return { ...state, paletteOpen: true, commandQuery: command.replace(/^\/+/u, ''), lastAction: `No direct command for ${command}; opened palette.` };
}

function routeCommand(command) {
  const key = command.replace(/^\/+/u, '');
  if (['dashboard', 'data', 'text', 'diagram', 'forms', 'activity'].includes(key)) return key;
  if (key === 'overview') return 'dashboard';
  if (key === 'fleet') return 'data';
  if (key === 'briefing') return 'text';
  if (key === 'map') return 'diagram';
  if (key === 'dispatch') return 'forms';
  if (key === 'events') return 'activity';
  if (key === 'canvas') return 'diagram';
  return undefined;
}

function clearCommand(state) {
  return {
    ...state,
    commandValue: '',
    commandCursor: 0,
    commandQuery: '',
    paletteState: paletteReducer(state.paletteState, { kind: 'setQuery', query: '' })
  };
}

function densityForLayoutMode(mode, fallback) {
  if (mode === 'compact') return 2;
  if (mode === 'wide') return 5;
  return fallback;
}

function cellPreview(value) {
  return clipTextCells(value, commandQueryCells).text;
}

export function completionPreview(value) {
  const commands = ['/palette', '/theme', '/handoff', '/overview', '/fleet', '/briefing', '/map', '/dispatch', '/events', '/context'];
  if (value.length === 0) return undefined;
  const match = commands.find((command) => command.startsWith(value) && command !== value);
  return match?.slice(value.length);
}

export function commandValidation(value) {
  if (value.length === 0) return { tone: 'info', message: 'ready for route command or shift note' };
  if (!value.startsWith('/')) return { tone: 'warning', message: 'commands begin with /' };
  return { tone: 'info', message: completionPreview(value) === undefined ? 'command ready' : 'completion available' };
}
