import {
  absolute,
  box,
  button,
  commandPalette,
  contextMenu,
  custom,
  modal,
  overlay,
  row,
  stack,
  structuredBlock
} from '@ismail-elkorchi/terminal-ui/widgets';

import { commandEntries } from '../data.mjs';
import { routeLabel, selectedVessel } from '../state.mjs';

export function transientLayers(state) {
  const layers = [];
  if (state.contextMenuOpen) layers.push(contextMenuOverlay(state));
  if (state.paletteOpen) layers.push(commandPaletteOverlay(state));
  if (state.modalOpen) layers.push(wizardModal(state));
  return layers;
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
  return modal(stack([
    structuredBlock({
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
    row([
      button({ id: 'wizard-close', label: 'Close', message: { kind: 'modal', open: false } }),
      button({ id: 'wizard-theme', label: 'Cycle theme', message: { kind: 'theme' } })
    ], { id: 'wizard-actions', gap: 1 })
  ], { id: 'wizard-stack', gap: 1 }), {
    id: 'handoff-wizard',
    title: 'Handoff wizard',
    width: 58,
    height: 12,
    zIndex: 30,
    border: { kind: 'rounded' }
  });
}

function contextMenuOverlay(state) {
  return absolute(contextMenu({
    id: 'floating-context',
    title: `${selectedVessel(state).name} actions`,
    selected: 'snapshot',
    items: [
      { id: 'snapshot', label: 'Create route snapshot', shortcut: 'S' },
      { id: 'handoff', label: 'Open handoff', message: { kind: 'modal', open: true }, shortcut: 'H' },
      { id: 'close', label: 'Close', message: { kind: 'context', open: false }, shortcut: 'Esc' }
    ]
  }), {
    id: 'context-placement',
    row: 8,
    column: 45,
    width: 34,
    height: 8,
    zIndex: 25
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
