import {
  activityFeed,
  fileExplorer,
  notificationStack,
  panel,
  sidePanel,
  stack,
  text
} from '@ismail-elkorchi/terminal-ui/widgets';

import { inspectorCard, metricRow, printProductExample } from './product-shell.mjs';

const entries = [
  {
    id: 'harbor',
    name: 'harbor',
    path: 'harbor',
    kind: 'directory',
    expanded: true,
    children: [
      { id: 'harbor/berths.json', name: 'berths.json', path: 'harbor/berths.json', kind: 'file', metadata: { bytes: '1840' } },
      { id: 'harbor/tide-plan.md', name: 'tide-plan.md', path: 'harbor/tide-plan.md', kind: 'file', metadata: { bytes: '920' } }
    ]
  },
  {
    id: 'dispatch',
    name: 'dispatch',
    path: 'dispatch',
    kind: 'directory',
    expanded: true,
    children: [
      { id: 'dispatch/shift-report.md', name: 'shift-report.md', path: 'dispatch/shift-report.md', kind: 'file', metadata: { bytes: '2304' } },
      { id: 'dispatch/checklist.txt', name: 'checklist.txt', path: 'dispatch/checklist.txt', kind: 'file', metadata: { bytes: '612' } }
    ]
  }
];

const before = 'harbor/berths.json';
const selected = 'dispatch/shift-report.md';

printProductExample({
  id: 'file-manager-product',
  source: 'examples/products/file-manager.mjs',
  workflow: 'file-manager',
  action: 'select dispatch report',
  appName: 'Harbor Files',
  route: 'Operations workspace',
  subtitle: 'Pure file-explorer model with caller-owned data',
  status: 'selection ready',
  commandValue: '/open dispatch/shift-report.md',
  commandFooter: 'Selection changed from berths.json to shift-report.md',
  main: panel({
    title: 'File manager',
    body: fileExplorer({
      id: 'file-manager',
      entries,
      selected,
      filterQuery: 'dispatch',
      preview: stack([
        text('# Shift report'),
        text('Two arrivals staged. South crane is clear.'),
        text('Next action: confirm tug assignment.')
      ], { gap: 1 }),
      previewSize: { kind: 'fixed', cells: 36 }
    })
  }),
  side: sidePanel({
    title: 'Selection',
    body: stack([
      inspectorCard('Selected file', [
        'path: dispatch/shift-report.md',
        'kind: file',
        'preview: markdown',
        'status: opened'
      ]),
      metricRow([
        { label: 'entries', value: '6' },
        { label: 'matches', value: '2' }
      ]),
      activityFeed({
        blocks: [
          { id: 'select', title: 'Selected dispatch report', status: 'success', summary: 'Preview and breadcrumb updated.' },
          { id: 'filter', title: 'Filter applied', status: 'info', summary: 'Visible tree narrowed to dispatch assets.' }
        ]
      }),
      notificationStack({
        placement: 'bottom-right',
        items: [{ id: 'ready', title: 'Preview refreshed', message: 'dispatch/shift-report.md', tone: 'success' }]
      })
    ], { gap: 1 })
  }),
  meta: {
    selectedBefore: before,
    selectedAfter: selected,
    previewVisible: true
  }
});
