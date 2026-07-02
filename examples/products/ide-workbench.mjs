import {
  activityFeed,
  areaGrid,
  commandPalette,
  panel,
  progressBar,
  scrollback,
  sidePanel,
  stack,
  tabs,
  text,
  textArea,
  tree
} from '@ismail-elkorchi/terminal-ui/widgets';

import { metricRow, printProductExample } from './product-shell.mjs';

const selectedBefore = 'src/runtime.ts';
const selectedAfter = 'src/agent-panel.ts';
const files = [
  {
    id: 'src',
    label: 'src',
    icon: '▾',
    expanded: true,
    children: [
      { id: 'src/agent-panel.ts', label: 'agent-panel.ts', icon: 'TS', metadata: { status: 'modified' } },
      { id: 'src/runtime.ts', label: 'runtime.ts', icon: 'TS' },
      { id: 'src/theme.ts', label: 'theme.ts', icon: 'TS' }
    ]
  },
  {
    id: 'tests',
    label: 'tests',
    icon: '▾',
    expanded: true,
    children: [
      { id: 'tests/agent-panel.test.ts', label: 'agent-panel.test.ts', icon: 'T' },
      { id: 'tests/runtime.test.ts', label: 'runtime.test.ts', icon: 'T' }
    ]
  },
  {
    id: 'docs',
    label: 'docs',
    icon: '▸',
    children: [
      { id: 'docs/harness.md', label: 'harness.md', icon: 'MD' }
    ]
  }
];

const code = [
  'export function AgentPanel(props: AgentPanelProps): Widget<Message> {',
  '  const transcript = renderTranscript(props.events);',
  '  const tools = renderToolActivity(props.tools);',
  '',
  '  return areaGrid({',
  '    areas: `',
  '      transcript tools',
  '      command    command',
  '    `,',
  '    rows: [{ kind: "fill" }, { kind: "fixed", cells: 5 }],',
  '    columns: [{ kind: "fill" }, { kind: "fixed", cells: 34 }],',
  '    children: { transcript, tools, command: commandDock(props.command) }',
  '  });',
  '}'
].join('\n');

printProductExample({
  id: 'ide-workbench-product',
  source: 'examples/products/ide-workbench.mjs',
  workflow: 'ide-workbench',
  action: 'open modified agent panel',
  appName: 'Code Studio',
  route: 'Agent Core workspace',
  subtitle: 'Explorer · editor · shell',
  status: 'editing',
  statusTone: 'info',
  commandValue: '/run tests agent-panel',
  commandFooter: 'Focused file changed from runtime.ts to agent-panel.ts',
  viewport: { columns: 160, rows: 42 },
  sideWidth: 44,
  suggestions: [
    { value: '/run tests', label: 'run tests', description: 'Execute the focused test target' },
    { value: '/toggle terminal', label: 'toggle terminal', description: 'Show or hide the bottom panel' },
    { value: '/open symbol', label: 'open symbol', description: 'Jump to a symbol in the current file' }
  ],
  main: panel({
    title: 'AgentPanel.ts - IDE workbench',
    density: 'compact',
    body: areaGrid({
      id: 'ide-workbench-layout',
      areas: `
        rail explorer editor
        rail explorer terminal
      `,
      rows: [{ kind: 'fill' }, { kind: 'fixed', cells: 10 }],
      columns: [{ kind: 'fixed', cells: 8 }, { kind: 'fixed', cells: 30 }, { kind: 'fill' }],
      gap: 1,
      children: {
        rail: sidePanel({
          title: '▣',
          density: 'compact',
          body: stack([
            text('EX', { textRole: 'badge' }),
            text('SCM'),
            text('DBG'),
            text('EXT'),
            text('AI')
          ], { gap: 1 })
        }),
        explorer: sidePanel({
          title: 'Explorer',
          density: 'compact',
          body: tree({
            id: 'ide-file-tree',
            nodes: files,
            selected: selectedAfter,
            scrollbar: { axis: 'vertical' }
          }),
          footer: text('2 changed · main')
        }),
        editor: tabs({
          id: 'ide-editor-tabs',
          selected: 'agent',
          tabs: [
            {
              id: 'agent',
              label: 'agent-panel.ts ●',
              panel: textArea({
                id: 'ide-code-editor',
                value: code,
                cursor: code.indexOf('commandDock'),
                scrollbar: { axis: 'both' }
              })
            },
            {
              id: 'runtime',
              label: 'runtime.ts',
              panel: textArea({
                value: 'export const runtimeReady = true;',
                cursor: 0
              })
            }
          ]
        }),
        terminal: panel({
          title: 'Terminal · Problems',
          density: 'compact',
          body: stack([
            scrollback({
              id: 'ide-terminal',
              items: [
                { id: 'cmd', text: '$ npm test -- agent-panel' },
                { id: 'build', text: '✓ build passed' },
                { id: 'unit', text: '✓ agent-panel.test.ts 12 passed' },
                { id: 'watch', text: 'watch mode ready on src/agent-panel.ts' }
              ],
              wrap: true,
              scrollbar: { axis: 'vertical' }
            }),
            progressBar({ label: 'test run', value: 100, max: 100, mode: 'compact', status: 'success' })
          ], { gap: 1 })
        })
      }
    })
  }),
  side: sidePanel({
    title: 'Outline',
    density: 'compact',
    body: areaGrid({
      id: 'ide-outline-grid',
      areas: `
        file
        metrics
        palette
        activity
      `,
      rows: [
        { kind: 'fixed', cells: 8 },
        { kind: 'fixed', cells: 3 },
        { kind: 'fixed', cells: 8 },
        { kind: 'fill' }
      ],
      columns: [{ kind: 'fill' }],
      gap: 1,
      children: {
        file: stack([
          text('Focused file'),
          text(`before: ${selectedBefore}`),
          text(`after:  ${selectedAfter}`),
          text('language: TypeScript'),
          text('state: modified')
        ], { gap: 0, padding: { left: 1, right: 1 } }),
        metrics: metricRow([
          { label: 'symbols', value: '6' },
          { label: 'tests', value: '12' }
        ]),
        palette: commandPalette({
          id: 'ide-command-palette',
          title: 'Command palette',
          query: 'test',
          selected: 0,
          entries: [
            { id: 'test-file', label: 'Run focused test file', group: 'Tasks', description: 'agent-panel.test.ts' },
            { id: 'test-watch', label: 'Toggle test watch', group: 'Tasks', description: 'Keep tests running' },
            { id: 'open-symbol', label: 'Open symbol search', group: 'Navigation', description: 'AgentPanel' }
          ],
          maxVisible: 3
        }),
        activity: activityFeed({
          selected: 1,
          blocks: [
            { id: 'open', title: 'Opened agent panel', status: 'info', summary: 'Explorer, tabs, and outline follow the focused file.' },
            { id: 'test', title: 'Focused tests passed', status: 'success', summary: '12 assertions completed for agent-panel.' }
          ]
        })
      }
    })
  }),
  meta: {
    selectedBefore,
    selectedAfter,
    testCount: 12,
    terminalVisible: true
  }
});
