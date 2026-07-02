import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  actionBar,
  bottomBar,
  button,
  commandDock,
  contentHeader,
  drawer,
  modal,
  panel,
  sidePanel,
  statusDock,
  text,
  toolbar,
  topBar
} from '../../dist/widgets/index.js';

function plain(widget, viewport = { columns: 54, rows: 10 }) {
  return renderFramePlain(renderWidgetFrame(widget, viewport));
}

function separatorCells(frame) {
  return frame.cells.filter((cell) => cell.source?.kind === 'divider' && cell.source?.role === 'separator');
}

test('visual components render polished surfaces while staying ordinary widgets', () => {
  const cases = [
    {
      name: 'panel',
      widget: panel({ title: 'Operations', body: text('Active berth'), footer: text('ETA stable') }),
      kind: 'surface',
      expected: [/Operations/u, /Active berth/u, /ETA stable/u]
    },
    {
      name: 'sidePanel',
      widget: sidePanel({ title: 'Navigation', body: text('Routes'), footer: text('Filters') }),
      kind: 'surface',
      expected: [/Navigation/u, /Routes/u, /Filters/u]
    },
    {
      name: 'drawer',
      widget: drawer({ title: 'Drawer', body: text('Commands'), footer: text('Esc close') }),
      kind: 'surface',
      expected: [/Drawer/u, /Commands/u, /Esc close/u]
    },
    {
      name: 'topBar',
      widget: topBar({ leading: text('File'), title: 'Northstar', trailing: text('Ready') }),
      kind: 'surface',
      expected: [/File/u, /Northstar/u, /Ready/u]
    },
    {
      name: 'bottomBar',
      widget: bottomBar({ leading: text('Tab focus'), center: text('/palette'), trailing: text('q quit') }),
      kind: 'surface',
      expected: [/Tab focus/u, /\/palette/u, /q quit/u]
    },
    {
      name: 'toolbar',
      widget: toolbar({ label: 'Tools', items: [button({ label: 'Run' }), button({ label: 'Stop' })] }),
      kind: 'row',
      expected: [/Tools/u, /Run/u, /Stop/u]
    },
    {
      name: 'actionBar',
      widget: actionBar({ actions: [button({ label: 'Save' }), button({ label: 'Cancel' })] }),
      kind: 'row',
      expected: [/Save/u, /Cancel/u]
    },
    {
      name: 'statusDock',
      widget: statusDock({ label: 'Status', items: [text('Healthy'), text('42ms')] }),
      kind: 'surface',
      expected: [/Status/u, /Healthy/u, /42ms/u]
    },
    {
      name: 'commandDock',
      widget: commandDock({ input: text('> dock open'), help: text('Enter run') }),
      kind: 'surface',
      expected: [/> dock open/u, /Enter run/u]
    },
    {
      name: 'contentHeader',
      widget: contentHeader({ title: 'Harbor watch', subtitle: 'North pier', actions: button({ label: 'Inspect' }) }),
      kind: 'row',
      expected: [/Harbor watch/u, /North pier/u, /Inspect/u]
    }
  ];

  for (const item of cases) {
    assert.equal(item.widget.kind, item.kind, `${item.name} should compose existing widgets`);
    const output = plain(item.widget);
    for (const expected of item.expected) {
      assert.match(output, expected, item.name);
    }
  }
});

test('panel surfaces expose section separators without nested border chrome', () => {
  const operations = panel({
    id: 'operations',
    title: 'Operations',
    actions: button({ id: 'refresh', label: 'Refresh' }),
    body: text('Active berth'),
    footer: text('ETA stable'),
    status: text('Ready'),
    density: 'compact'
  });
  const side = sidePanel({
    id: 'inspector',
    title: 'Inspector',
    body: text('Vessel detail'),
    footer: text('Esc close'),
    density: 'compact'
  });
  const panelFrame = renderWidgetFrame(operations, { columns: 48, rows: 10 });
  const sideFrame = renderWidgetFrame(side, { columns: 32, rows: 8 });
  const highContrastFrame = renderWidgetFrame(operations, { columns: 48, rows: 10 }, { theme: highContrastTheme });
  const noColor = createVisualSnapshot({
    frame: highContrastFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(operations.kind, 'surface');
  assert.equal(side.kind, 'surface');
  assert.equal(separatorCells(panelFrame).length >= 2, true);
  assert.equal(separatorCells(sideFrame).length >= 2, true);
  assert.equal(separatorCells(highContrastFrame).length >= 2, true);
  assert.equal(separatorCells(panelFrame)[0]?.style?.fg?.token, 'surface.border');
  assert.match(renderFramePlain(panelFrame), /Operations/u);
  assert.match(renderFramePlain(panelFrame), /Active berth/u);
  assert.match(renderFramePlain(panelFrame), /ETA stable/u);
  assert.match(noColor.plainTextFrame, /─/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

test('command docks separate input help and status without boxed chrome', () => {
  const dock = commandDock({
    id: 'command',
    input: text('> dispatch'),
    help: text('Tab focus · Enter run'),
    status: text('Ready')
  });
  const frame = renderWidgetFrame(dock, { columns: 40, rows: 8 });
  const highContrastFrame = renderWidgetFrame(dock, { columns: 40, rows: 8 }, { theme: highContrastTheme });
  const noColor = createVisualSnapshot({
    frame: highContrastFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(dock.kind, 'surface');
  assert.equal(separatorCells(frame).length >= 2, true);
  assert.equal(separatorCells(highContrastFrame).length >= 2, true);
  assert.equal(frame.cells.some((cell) => cell.source?.role === 'border'), false);
  assert.match(renderFramePlain(frame), /> dispatch/u);
  assert.match(renderFramePlain(frame), /Tab focus/u);
  assert.match(renderFramePlain(frame), /Ready/u);
  assert.match(noColor.plainTextFrame, /─/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

test('drawers expose section anatomy inside an elevated surface', () => {
  const widget = drawer({
    id: 'route-drawer',
    title: 'Route drawer',
    body: text('Inbound queue'),
    footer: text('Esc close'),
    side: 'right',
    density: 'compact'
  });
  const frame = renderWidgetFrame(widget, { columns: 40, rows: 10 });
  const highContrastFrame = renderWidgetFrame(widget, { columns: 40, rows: 10 }, { theme: highContrastTheme });
  const noColor = createVisualSnapshot({
    frame: highContrastFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(widget.kind, 'surface');
  assert.equal(separatorCells(frame).length >= 2, true);
  assert.equal(separatorCells(highContrastFrame).length >= 2, true);
  assert.equal(frame.cells.some((cell) => cell.source?.role === 'border'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.label === 'shadow'), true);
  assert.equal(separatorCells(frame)[0]?.style?.fg?.token, 'surface.border');
  assert.match(renderFramePlain(frame), /Route drawer/u);
  assert.match(renderFramePlain(frame), /Inbound queue/u);
  assert.match(renderFramePlain(frame), /Esc close/u);
  assert.match(noColor.plainTextFrame, /─/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

test('modals render as elevated dialog surfaces', () => {
  const widget = modal(text('Confirm berth'), {
    id: 'handoff',
    title: 'Handoff',
    width: 24,
    height: 7
  });
  const frame = renderWidgetFrame(widget, { columns: 42, rows: 11 });
  const highContrastFrame = renderWidgetFrame(widget, { columns: 42, rows: 11 }, { theme: highContrastTheme });
  const noColor = createVisualSnapshot({
    frame: highContrastFrame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });
  const backgroundCells = frame.cells.filter((cell) =>
    cell.source?.kind === 'surface'
    && cell.source.role === 'decoration'
    && cell.style?.bg?.token === 'surface.raised.background'
  );
  const borderCell = frame.cells.find((cell) => cell.source?.role === 'border');

  assert.equal(widget.kind, 'modal');
  assert.equal(backgroundCells.length > 0, true);
  assert.equal(frame.cells.some((cell) => cell.source?.label === 'shadow'), true);
  assert.equal(borderCell?.style?.fg?.token, 'surface.raised.border');
  assert.match(renderFramePlain(frame), /Handoff/u);
  assert.match(renderFramePlain(frame), /Confirm berth/u);
  assert.match(noColor.plainTextFrame, /Handoff/u);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
});

test('visual components preserve caller-owned message types through key maps', () => {
  const widget = panel({
    title: 'Typed panel',
    body: text('Body'),
    keyMap: { enter: { type: 'submit' } }
  });

  assert.deepEqual(widget.keyMap, { enter: { type: 'submit' } });
});

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}
