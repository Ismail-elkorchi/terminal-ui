import { text } from '@ismail-elkorchi/terminal-ui/components';
import {
  defineComponent,
  mergeTerminalStyles as mergeComponentTerminalStyles,
  type ComponentInput,
  type ComponentMeasureInput,
  type ComponentRenderInput,
  type DecorativeLeafComponentDefinition,
  type SemanticLeafComponentDefinition
} from '@ismail-elkorchi/terminal-ui/component';
import {
  mergeTerminalStyles as mergeRendererTerminalStyles,
  renderElementFrame,
  renderFramePlain,
  span,
  type Canvas2D,
  type CanvasPainterInput,
  type DiffFramesOptions,
  type Frame,
  type FrameCellSource,
  type FramePassContext,
  type LayoutNode,
  type Rect,
  type RenderInstrumentation,
  type RenderSpan,
  type RenderStage,
  type RenderWorkMeasurement
} from '@ismail-elkorchi/terminal-ui/renderer';

const componentComposedStyle = mergeComponentTerminalStyles({ bold: true }, { italic: true });
const rendererComposedStyle = mergeRendererTerminalStyles(componentComposedStyle, { underline: true });
void rendererComposedStyle;

const renderSpan: RenderSpan = span('ready', { style: { bold: true } });
const frame: Frame = renderElementFrame(text({ content: 'Ready' }), { columns: 20, rows: 2 });
const plain = renderFramePlain(frame);
const renderStage: RenderStage = 'resolve_element';
const instrumentation: RenderInstrumentation = {
  now: () => 0,
  record: (measurement) => {
    const stage: RenderStage = measurement.stage;
    void stage;
  },
  recordWork: (measurement: RenderWorkMeasurement) => {
    const count: number = measurement.count;
    void count;
  }
};
declare const layoutNode: LayoutNode;
const layoutLayerId: string = layoutNode.layer.id;
const layoutFactoryName: string = layoutNode.factoryName;

// @ts-expect-error render bounds use terminal cell numbers
renderElementFrame(text({ content: 'Invalid' }), { columns: '20', rows: 2 });

const invalidInteractionState: FrameCellSource = {
  // @ts-expect-error frame-cell interaction state is a closed contract
  interactionState: 'unknown'
};
const validInteractionState: FrameCellSource = { interactionState: 'busy' };

declare const drawing: Canvas2D;
declare const painterInput: CanvasPainterInput;
drawing.brailleSubcell(0, 0);
painterInput.canvas.point(0, 0, { text: '*' });
const absoluteRect: Rect = { row: 1, column: 1, width: 2, height: 2 };
const diffOptions: DiffFramesOptions = { dirtyRegions: [absoluteRect] };
// @ts-expect-error Canvas2D uses x/y local coordinates
drawing.rect(absoluteRect, { fill: { text: '*' } });
drawing.rect({ x: 0, y: 0, width: 2, height: 2 }, { fill: { text: '*' } });

const writeOnly = defineComponent({
  name: 'terminal-ui-tests/components/write-only',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  states: ['inert'],
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 2, preferredHeight: 1 }),
  render({ target }) {
    target.write(0, 0, [{ text: 'ok' }]);
    // @ts-expect-error component render targets do not expose frame-buffer reads
    const readCell = target.readCell;
    void readCell;
  },
  accessibility: ({ id }) => ({ id, role: 'text', label: 'write only' })
});
writeOnly({ id: 'write-only-component' });
writeOnly({ id: 'inert-component', inert: true });
// @ts-expect-error components without own options reject undeclared fields
writeOnly({ id: 'unknown-option-component', anything: true });
// @ts-expect-error required identity cannot be omitted
writeOnly({});
writeOnly({
  id: 'invalid-action-mapper',
  // @ts-expect-error action-free components cannot accept an action mapper
  onTransition: () => ({ kind: 'unused' })
});

const rendererWithUnsupportedPlacement: SemanticLeafComponentDefinition = {
  name: 'terminal-ui-tests/components/placed-leaf',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id }) => ({ id, role: 'text', label: id }),
  // @ts-expect-error components cannot take ownership of layout placement
  place: ({ bounds }: { readonly bounds: Rect }) => bounds
};
void rendererWithUnsupportedPlacement;

declare const componentRenderInput: ComponentRenderInput<Record<never, never>>;
componentRenderInput.target.write(0, 0, [{ text: 'ok' }]);
declare const componentMeasureInput: ComponentMeasureInput<Record<never, never>>;
// @ts-expect-error measurement occurs before viewport resolution
const componentMeasureViewport = componentMeasureInput.viewport;

const interactiveDecoration: DecorativeLeafComponentDefinition = {
  name: 'terminal-ui-tests/components/interactive-decoration',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'decorative',
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  // @ts-expect-error decorative components cannot expose focus targets
  focusTargets: ({ bounds }: ComponentInput<Record<never, never>>) => [{ id: 'self', bounds }]
};
void interactiveDecoration;

const decoration = defineComponent({
  name: 'terminal-ui-tests/components/decoration',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'decorative',
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined
});
decoration({});
decoration({
  id: 'keyed-decoration',
  // @ts-expect-error decorative component instances cannot map actions
  onTransition: () => ({ kind: 'press' })
});

// @ts-expect-error semantic leaf components require accessibility
const missingAccessibility: SemanticLeafComponentDefinition = {
  name: 'terminal-ui-tests/components/missing-accessibility',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined
};
void missingAccessibility;

declare const framePassContext: FramePassContext;
const framePassColumns = framePassContext.terminalSize.columns;
// @ts-expect-error public frames do not expose private render nodes
const privateRenderNode = frame.node;
// @ts-expect-error public frames do not expose private interaction regions
const privateRegions = frame.regions;

void renderSpan;
void instrumentation;
void layoutLayerId;
void layoutFactoryName;
void painterInput;
void renderStage;
void plain;
void invalidInteractionState;
void validInteractionState;
void privateRenderNode;
void privateRegions;
void diffOptions;
void componentRenderInput;
void componentMeasureViewport;
void framePassColumns;
