import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import {
  activityIndicator,
  areaGrid,
  commandBar,
  commandDock,
  helpBar,
  row,
  stack,
  statusDock,
  text,
  topBar
} from '@ismail-elkorchi/terminal-ui/widgets';

export const productViewport = Object.freeze({ columns: 112, rows: 32 });

export function printProductExample(options) {
  const viewport = options.viewport ?? productViewport;
  const frame = renderWidgetFrame(productFrame({
    ...options,
    viewport
  }), viewport);
  console.log(renderFramePlain(frame));
  console.log(JSON.stringify({
    source: options.source,
    workflow: options.workflow,
    action: options.action,
    viewport,
    ...options.meta
  }));
}

export function productFrame(options) {
  return areaGrid({
    id: `${options.id}:frame`,
    areas: `
      top top
      main side
      bottom bottom
    `,
    rows: [{ kind: 'fixed', cells: 3 }, { kind: 'fill' }, { kind: 'fixed', cells: 5 }],
    columns: [{ kind: 'fill' }, { kind: 'fixed', cells: 34 }],
    gap: 1,
    children: {
      top: productTopBar(options),
      main: options.main,
      side: options.side,
      bottom: productCommandDock(options)
    }
  });
}

export function inspectorCard(title, lines) {
  return stack([
    text(title),
    ...lines.map((line, index) => text(line, { id: `inspector:${slug(title)}:${String(index)}` }))
  ], {
    id: `inspector:${slug(title)}`,
    gap: 1,
    padding: 1
  });
}

export function metricRow(items) {
  return row(items.map((item) => text(`${item.label}: ${item.value}`)), {
    gap: 2,
    padding: { left: 1, right: 1 }
  });
}

function productTopBar(options) {
  return topBar({
    id: `${options.id}:top`,
    leading: text(options.appName),
    center: stack([
      text(options.route),
      text(options.subtitle)
    ], { gap: 0 }),
    trailing: statusDock({
      items: [
        activityIndicator({ label: options.status, status: options.statusTone ?? 'success' }),
        text(`${String(options.viewport.columns)}x${String(options.viewport.rows)}`)
      ]
    })
  });
}

function productCommandDock(options) {
  return commandDock({
    id: `${options.id}:command`,
    input: commandBar({
      value: options.commandValue,
      cursor: options.commandValue.length,
      prompt: '>',
      footer: options.commandFooter,
      suggestions: options.suggestions ?? [
        { value: '/open', label: 'open', description: 'Open the selected item' },
        { value: '/filter', label: 'filter', description: 'Narrow visible data' }
      ],
      selectedSuggestion: 0
    }),
    help: helpBar({
      bindings: options.helpBindings ?? [
        { key: 'Tab', label: 'focus' },
        { key: 'Enter', label: 'apply' },
        { key: '/', label: 'commands' }
      ]
    })
  });
}

function slug(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/(^-|-$)/gu, '');
}
