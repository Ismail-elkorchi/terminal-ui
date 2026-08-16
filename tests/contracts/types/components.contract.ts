import {
  button,
  activityIndicator,
  canvas,
  dataGrid,
  form,
  text,
  type ActivityIndicatorOptions,
  type CanvasPainter,
  type Element,
  type ElementMessage,
  type FormOptions
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
  presentation: { interaction: { kind: 'row', selection: { mode: 'single' as const } } },
  onTransition: (transition) => ({ kind: 'grid' as const, transition })
});
const passive: Element = text({ content: 'Ready' });
const content = [passive] as const;
const formOptions: FormOptions<typeof content> = {
  title: 'Settings',
  slots: { content },
};
const settings = form(formOptions);
const runningActivity: ActivityIndicatorOptions = {
  label: 'Loading',
  status: 'running',
  frames: ['.', 'o'],
  frameIndex: 0,
};
activityIndicator(runningActivity);
const settledActivity: ActivityIndicatorOptions = { label: 'Done', status: 'success' };
activityIndicator(settledActivity);
// @ts-expect-error settled activity indicators cannot retain animation options
const invalidSettledActivity: ActivityIndicatorOptions = { label: 'Done', status: 'success', frames: ['.'] };
type Equal<TLeft, TRight> = TLeft extends TRight
  ? TRight extends TLeft ? true : false
  : false;
const exactActivityOptions: Equal<ActivityIndicatorOptions, Parameters<typeof activityIndicator>[0]> = true;
const exactFormOptions: Equal<FormOptions, Parameters<typeof form>[0]> = true;
const clearUnderlay = text({ content: 'Clear', meta: { layer: { underlay: 'clear' } } });
const preserveUnderlay = text({ content: 'Preserve', meta: { layer: { underlay: 'preserve' } } });
const inheritedBackground = text({ content: 'Inherit', meta: { layer: { underlay: 'inheritBackground' } } });
type SaveMessage = ElementMessage<typeof save>;
const message: SaveMessage = { kind: 'save' };

// @ts-expect-error interactive components require stable identity
button({ label: 'Invalid', onAction: () => ({ kind: 'invalid' } as const) });
// @ts-expect-error component options reject misspelled fields at the typed public boundary
button({ id: 'danger', label: 'Delete', disabeld: true, onAction: () => ({ kind: 'delete' } as const) });

void rows;
void drawing;
void passive;
void clearUnderlay;
void preserveUnderlay;
void inheritedBackground;
void message;
void save;
void settings;
void invalidSettledActivity;
void exactActivityOptions;
void exactFormOptions;
