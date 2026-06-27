import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { stack, statusBar, tree } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = stack([
  tree({
    id: 'files',
    selected: 'src',
    nodes: [
      {
        id: 'project',
        label: 'project',
        expanded: true,
        children: [
          { id: 'src', label: 'src', expanded: true, children: [{ id: 'index', label: 'index.ts' }] },
          { id: 'docs', label: 'docs', children: [{ id: 'readme', label: 'README.md' }] }
        ]
      }
    ]
  }),
  statusBar({ id: 'status', text: '2 folders, 2 files' })
]);

console.log(renderFrame(renderWidgetFrame(widget, { columns: 36, rows: 10 })));
