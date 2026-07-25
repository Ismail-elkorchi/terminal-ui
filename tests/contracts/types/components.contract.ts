import {
  button,
  table,
  text,
  type Element,
  type ElementMessage
} from '@ismail-elkorchi/terminal-ui/components';

const save = button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) });
const rows = table({
  id: 'rows',
  rows: [{ id: 1, name: 'one' }],
  getRowId: (row) => String(row.id),
  columns: [{ id: 'name', value: (row) => row.name }],
  onAction: (action) => ({ kind: 'table' as const, action })
});
const passive: Element = text('Ready');
const clearUnderlay = text('Clear', { meta: { layer: { underlay: 'clear' } } });
const preserveUnderlay = text('Preserve', { meta: { layer: { underlay: 'preserve' } } });
const inheritedBackground = text('Inherit', { meta: { layer: { underlay: 'inheritBackground' } } });
type SaveMessage = ElementMessage<typeof save>;
const message: SaveMessage = { kind: 'save' };

// @ts-expect-error interactive components require stable identity
button({ label: 'Invalid', onPress: () => ({ kind: 'invalid' } as const) });

void rows;
void passive;
void clearUnderlay;
void preserveUnderlay;
void inheritedBackground;
void message;
void save;
