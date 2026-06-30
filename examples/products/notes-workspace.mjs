import {
  activityFeed,
  breadcrumb,
  panel,
  scrollback,
  sidePanel,
  stack,
  text,
  textArea,
  toggleSwitch
} from '@ismail-elkorchi/terminal-ui/widgets';

import { inspectorCard, metricRow, printProductExample } from './product-shell.mjs';

const beforeTitle = 'Harbor review';
const afterTitle = 'Harbor review - published';
const note = [
  '# Harbor review - published',
  '',
  '- Confirmed night berth handoff.',
  '- Added follow-up for crane operator.',
  '- Published summary to the watch board.'
].join('\n');

printProductExample({
  id: 'notes-workspace-product',
  source: 'examples/products/notes-workspace.mjs',
  workflow: 'note-editor-workspace',
  action: 'publish edited note',
  appName: 'Notes Desk',
  route: 'Editor workspace',
  subtitle: 'Text area, activity log, breadcrumbs, and publication state',
  status: 'published',
  commandValue: '/publish harbor-review',
  commandFooter: 'The edited note is visible in the main editor pane',
  main: panel({
    title: 'Note editor',
    body: stack([
      breadcrumb({
        items: [
          { id: 'desk', label: 'Desk' },
          { id: 'ops', label: 'Operations' },
          { id: 'review', label: afterTitle }
        ]
      }),
      textArea({
        id: 'note-body',
        value: note,
        cursor: note.length,
        scrollbar: { axis: 'vertical' }
      }),
      scrollback({
        id: 'note-comments',
        items: [
          { id: 'm1', text: 'Mina: add the south crane follow-up.' },
          { id: 'm2', text: 'Jon: publication window is open.' },
          { id: 'm3', text: 'System: note published to watch board.' }
        ],
        wrap: true
      })
    ], { gap: 1 })
  }),
  side: sidePanel({
    title: 'Document state',
    body: stack([
      inspectorCard('Publication', [
        `before: ${beforeTitle}`,
        `after: ${afterTitle}`,
        'visibility: watch board',
        'review: complete'
      ]),
      metricRow([
        { label: 'lines', value: '5' },
        { label: 'comments', value: '3' }
      ]),
      toggleSwitch({ label: 'Published', checked: true, onLabel: 'yes', offLabel: 'no' }),
      activityFeed({
        blocks: [
          { id: 'edit', title: 'Note edited', status: 'success', summary: 'Title and checklist were updated.' },
          { id: 'publish', title: 'Published', status: 'success', summary: 'Workspace state reflects the action.' }
        ]
      })
    ], { gap: 1 })
  }),
  meta: {
    titleBefore: beforeTitle,
    titleAfter: afterTitle,
    published: true
  }
});
