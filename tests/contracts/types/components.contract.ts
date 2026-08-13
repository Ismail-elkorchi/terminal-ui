import {
  button,
  canvas,
  dataGrid,
  text,
  type CanvasPainter,
  type Element,
  type ElementMessage
} from '@ismail-elkorchi/terminal-ui/components';

const paint: CanvasPainter = ({ canvas: drawing }) => {
  drawing.point(0, 0, { text: '*' });
};
const drawing = canvas({
  painter: paint,
  label: 'drawing',
  measurement: { minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }
});
const save = button({ id: 'save', label: 'Save', onAction: () => ({ kind: 'save' } as const) });
const rows = dataGrid({
  id: 'rows',
  rows: [{ id: 1, name: 'one' }],
  getRowId: (row) => String(row.id),
  columns: [{ id: 'name', value: (row) => row.name }],
  presentation: { interaction: { kind: 'row',
  selectionMode: 'single' as const, selectedRowIds: [] } },
  onTransition: (transition) => ({ kind: 'grid' as const, transition })
});
const passive: Element = text({ content: 'Ready' });
const clearUnderlay = text({ content: 'Clear', meta: { layer: { underlay: 'clear' } } });
const preserveUnderlay = text({ content: 'Preserve', meta: { layer: { underlay: 'preserve' } } });
const inheritedBackground = text({ content: 'Inherit', meta: { layer: { underlay: 'inheritBackground' } } });
type SaveMessage = ElementMessage<typeof save>;
const message: SaveMessage = { kind: 'save' };

// @ts-expect-error interactive components require stable identity
button({ label: 'Invalid', onAction: () => ({ kind: 'invalid' } as const) });

void rows;
void drawing;
void passive;
void clearUnderlay;
void preserveUnderlay;
void inheritedBackground;
void message;
void save;
