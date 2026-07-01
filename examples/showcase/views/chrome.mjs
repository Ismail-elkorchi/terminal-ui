import {
  activityIndicator,
  accordion,
  commandBar,
  commandDock,
  grid,
  inputField,
  list,
  menuBar,
  progressBar,
  shortcutBar,
  stack,
  statusDock,
  statusBar,
  text,
  topBar,
  tree
} from '@ismail-elkorchi/terminal-ui/widgets';

import { navigationNodes, paletteSuggestions } from '../data.mjs';
import { overlayLabel, quickActions, routeForNode, routeLabel, selectedVessel, statusLabel } from '../state.mjs';
import { completionPreview, commandValidation } from '../update.mjs';
import { themeLabel } from '../theme.mjs';
import { densityRole, progressTone } from './view-utils.mjs';

export function topChrome(state) {
  const density = densityRole(state.density);
  return stack([
    topBar({
      id: 'showcase-top-bar',
      title: 'Northstar Control',
      variant: 'base',
      density,
      leading: menuBar({
        id: 'main-menu',
        selected: 'view',
        items: [
          { id: 'file', label: 'File', shortcut: 'F' },
          { id: 'view', label: 'View', shortcut: 'V', checked: true },
          { id: 'tools', label: 'Tools', shortcut: 'T' },
          { id: 'help', label: 'Help', shortcut: '?' }
        ],
        keyMap: {
          '?': { kind: 'modal', open: true },
          '/': { kind: 'palette', open: true },
          t: { kind: 'theme' }
        }
      }),
      center: text(routeLabel(state.selectedRoute), { id: 'top-route', textRole: 'subtitle' }),
      trailing: activityIndicator({
        id: 'top-activity',
        label: `${statusLabel(state)} · ${themeLabel(state)}`,
        status: state.progress >= 92 ? 'success' : 'running'
      })
    }),
    progressBar({
      id: 'top-progress',
      label: `${selectedVessel(state).name} service`,
      value: state.progress,
      max: 100,
      mode: 'full',
      showPercentage: true,
      status: progressTone(state.progress),
      frame: state.spinnerFrame
    })
  ], { id: 'top-chrome' });
}

export function navigationPane(state) {
  return grid([
    text('Operations', { id: 'nav-title', textRole: 'heading' }),
    inputField({
      id: 'nav-filter',
      value: state.navFilter,
      message: { kind: 'palette', open: true },
      keyMap: {
        enter: { kind: 'palette', open: true },
        backspace: { kind: 'navFilter', value: state.navFilter.slice(0, Math.max(0, state.navFilter.length - 1)) },
        escape: { kind: 'navFilter', value: '' }
      },
      inputMap: {
        text: (value) => ({ kind: 'navFilterText', text: value }),
        paste: (value) => ({ kind: 'navFilter', value })
      }
    }),
    tree({
      id: 'showcase-nav',
      nodes: navigationNodes,
      selected: state.selectedNavigation,
      filterQuery: state.navFilter,
      toMessage: (node) => ({ kind: 'route', route: routeForNode(node.id) }),
      keyMap: {
        arrowDown: { kind: 'route', route: 'data' },
        arrowUp: { kind: 'route', route: 'dashboard' },
        '/': { kind: 'palette', open: true }
      },
      scrollbar: { visible: true }
    }),
    accordion({
      id: 'quick-accordion',
      items: [{
        id: 'launch',
        title: 'Quick launch',
        expanded: true,
        message: { kind: 'quickPick' },
        body: list({
          id: 'quick-list',
          items: quickActions,
          selected: state.selectedQuickAction,
          toMessage: (value) => quickActionMessage(value),
          keyMap: {
            arrowDown: { kind: 'quick', index: Math.min(quickActions.length - 1, state.selectedQuickAction + 1) },
            arrowUp: { kind: 'quick', index: Math.max(0, state.selectedQuickAction - 1) },
            enter: { kind: 'quickPick' }
          },
          scrollbar: { visible: true }
        })
      }]
    })
  ], {
    id: 'navigation-pane',
    rows: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 8 }
    ],
    columns: [{ kind: 'fill' }],
    gap: 1
  });
}

export function bottomChrome(state) {
  return commandDock({
    id: 'showcase-command-dock',
    density: densityRole(state.density),
    input: commandBar({
      id: 'showcase-command',
      prompt: '›',
      value: state.commandValue,
      cursor: state.commandCursor,
      placeholder: 'Type /palette, /theme, /handoff, /fleet, /dispatch, /events...',
      completionPreview: completionPreview(state.commandValue),
      suggestions: paletteSuggestions,
      selectedSuggestion: state.paletteOpen ? 0 : 1,
      matchQuery: state.commandQuery,
      validation: commandValidation(state.commandValue),
      footer: `Enter runs · Tab focus · Esc closes overlays · ${state.mouseEnabled ? 'mouse on' : 'mouse off'} · ${overlayLabel(state)}`,
      keyMap: {
        enter: { kind: 'submitCommand' },
        escape: { kind: 'escape' },
        backspace: { kind: 'commandBackspace' },
        delete: { kind: 'commandDelete' },
        arrowLeft: { kind: 'commandMove', delta: -1 },
        arrowRight: { kind: 'commandMove', delta: 1 },
        home: { kind: 'commandHome' },
        end: { kind: 'commandEnd' },
        arrowUp: { kind: 'paletteMove', delta: -1 },
        arrowDown: { kind: 'paletteMove', delta: 1 }
      },
      inputMap: {
        text: (value) => ({ kind: 'commandText', text: value }),
        paste: (value) => ({ kind: 'commandText', text: value })
      }
    }),
    help: shortcutBar({
      id: 'showcase-shortcuts',
      shortcuts: [
        { id: 'palette', key: '/', label: 'commands', message: { kind: 'palette', open: true } },
        { id: 'handoff', key: 'H', label: 'handoff', message: { kind: 'modal', open: true } },
        { id: 'theme', key: 'T', label: 'theme', message: { kind: 'theme' } },
        { id: 'context', key: 'C', label: 'context', message: { kind: 'context', open: true } }
      ]
    }),
    status: statusDock({
      id: 'bottom-status',
      density: 'compact',
      items: [
        statusBar({ id: 'bottom-status-action', text: state.lastAction }),
        text(overlayLabel(state), { id: 'bottom-status-overlay', textRole: 'metadata' })
      ]
    })
  });
}

function quickActionMessage(value) {
  if (value === 'Palette') return { kind: 'palette', open: true };
  if (value === 'Handoff') return { kind: 'modal', open: true };
  if (value === 'Context') return { kind: 'context', open: true };
  return { kind: 'theme' };
}
