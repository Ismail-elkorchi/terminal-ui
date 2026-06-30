import {
  absolute,
  box,
  commandPalette,
  contextMenu,
  custom,
  floatingWindow,
  notificationStack,
  overlay,
  structuredBlock,
  wizardDialog
} from '@ismail-elkorchi/terminal-ui/widgets';

import { commandEntries } from '../data.mjs';
import { routeLabel, selectedVessel } from '../state.mjs';

export function transientLayers(state) {
  const layers = [];
  if (state.contextMenuOpen) layers.push(contextMenuOverlay(state));
  if (state.paletteOpen) layers.push(commandPaletteOverlay(state));
  if (state.modalOpen) layers.push(wizardModal(state));
  if (state.notificationState.items.length > 0) layers.push(notificationOverlay(state));
  return layers;
}

function notificationOverlay(state) {
  return notificationStack({
    id: 'showcase-notifications',
    items: state.notificationState.items,
    selected: 0,
    placement: 'top-right',
    maxVisible: 3,
    maxWidth: 36,
    zIndex: 50,
    toDismissMessage: (item) => ({ kind: 'notificationDismiss', id: item.id })
  });
}

function commandPaletteOverlay(state) {
  return overlay([
    absolute(opaquePanel('palette-blank'), {
      id: 'palette-blank-placement',
      row: 8,
      column: 29,
      width: 70,
      height: 15,
      zIndex: 19
    }),
    absolute(box(commandPalette({
      id: 'command-palette',
      title: 'Northstar commands',
      query: state.commandQuery,
      selected: state.paletteState.selectedIndex,
      maxVisible: 8,
      entries: commandEntries,
      helpText: 'Search routes, handoff actions, and visual modes',
      keyMap: {
        escape: { kind: 'palette', open: false },
        arrowUp: { kind: 'paletteMove', delta: -1 },
        arrowDown: { kind: 'paletteMove', delta: 1 },
        enter: { kind: 'palettePick' }
      }
    }), {
      id: 'palette-modal',
      border: { kind: 'double', title: 'Find anything' },
      padding: 1,
      focus: { scope: 'contain' }
    }), {
      id: 'palette-placement',
      row: 8,
      column: 29,
      width: 70,
      height: 15,
      zIndex: 20
    })
  ], { id: 'palette-overlay' });
}

function wizardModal(state) {
  const vessel = selectedVessel(state);
  return wizardDialog({
    id: 'handoff-wizard',
    title: 'Handoff wizard',
    width: 58,
    height: 12,
    steps: [
      { id: 'watch', label: 'Watch' },
      { id: 'route', label: 'Route' },
      { id: 'handoff', label: 'Handoff' }
    ],
    currentStep: 1,
    body: structuredBlock({
      id: 'wizard-summary',
      title: 'Shift handoff',
      status: 'running',
      summary: `${vessel.name} remains the active watch object while the next team prepares route notes.`,
      fields: [
        { label: 'watch', value: 'night shift' },
        { label: 'route', value: routeLabel(state.selectedRoute) },
        { label: 'signal', value: `${String(vessel.score)}%` }
      ]
    }),
    actions: [
      { id: 'wizard-close', label: 'Close', message: { kind: 'modal', open: false } },
      { id: 'wizard-theme', label: 'Cycle theme', message: { kind: 'theme' } }
    ],
    zIndex: 30
  });
}

function contextMenuOverlay(state) {
  return floatingWindow({
    id: 'context-placement',
    title: `${selectedVessel(state).name} actions`,
    body: contextMenu({
      id: 'floating-context',
      selected: 'snapshot',
      items: [
        { id: 'snapshot', label: 'Create route snapshot', shortcut: 'S' },
        { id: 'handoff', label: 'Open handoff', message: { kind: 'modal', open: true }, shortcut: 'H' },
        { id: 'close', label: 'Close', message: { kind: 'context', open: false }, shortcut: 'Esc' }
      ]
    }),
    row: 8,
    column: 45,
    width: 34,
    height: 10,
    closeMessage: { kind: 'context', open: false },
    active: true
  });
}

function opaquePanel(id) {
  return custom({
    id,
    accessibility: { decorative: true },
    renderer: {
      render({ node, buffer }) {
        const width = Math.max(0, node.bounds.width);
        for (let rowOffset = 0; rowOffset < node.bounds.height; rowOffset += 1) {
          buffer.write(node.bounds.row + rowOffset, node.bounds.column, [{
            text: ' '.repeat(width),
            style: { bg: { kind: 'theme', token: 'surface.background' } }
          }]);
        }
      }
    }
  });
}
