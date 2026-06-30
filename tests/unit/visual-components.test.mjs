import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  actionBar,
  bottomBar,
  button,
  commandDock,
  contentHeader,
  drawer,
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

test('visual components preserve caller-owned message types through key maps', () => {
  const widget = panel({
    title: 'Typed panel',
    body: text('Body'),
    keyMap: { enter: { type: 'submit' } }
  });

  assert.deepEqual(widget.keyMap, { enter: { type: 'submit' } });
});
