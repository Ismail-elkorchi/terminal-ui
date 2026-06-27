import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { button, checkbox, form, modal, progressBar, row, stack, statusBar } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = stack([
  progressBar({ id: 'progress', label: 'Install', value: 2, max: 4 }),
  modal(form([
    checkbox({ id: 'terms', label: 'Accept license', checked: true, message: { kind: 'terms' } }),
    row([
      button({ id: 'back', label: 'Back', message: { kind: 'back' } }),
      button({ id: 'next', label: 'Next', message: { kind: 'next' } })
    ])
  ], { id: 'step', title: 'Step 2' }), {
    id: 'dialog',
    title: 'Installer'
  }),
  statusBar({ id: 'status', text: 'Ready to continue' })
]);

console.log(renderFrame(renderWidgetFrame(widget, { columns: 50, rows: 12 })));
