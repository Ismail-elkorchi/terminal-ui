import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { button, checkbox, field, form, row, selectBox, textInput } from '@ismail-elkorchi/terminal-ui/widgets';

const widget = form([
  field(textInput({ id: 'name', value: 'Workspace' }), {
    id: 'name-field',
    label: 'Name',
    description: 'Shown in window titles'
  }),
  checkbox({
    id: 'telemetry',
    label: 'Send diagnostics',
    checked: false,
    message: { kind: 'toggle' }
  }),
  selectBox({
    id: 'theme',
    label: 'Theme',
    selected: 'modern',
    options: [
      { id: 'modern', label: 'Modern', value: 'modern' },
      { id: 'contrast', label: 'High contrast', value: 'contrast' }
    ]
  }),
  row([
    button({ id: 'save', label: 'Save', message: { kind: 'save' } }),
    button({ id: 'cancel', label: 'Cancel', message: { kind: 'cancel' } })
  ])
], {
  id: 'settings',
  title: 'Settings'
});

console.log(renderFramePlain(renderWidgetFrame(widget, { columns: 48, rows: 12 })));
