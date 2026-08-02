import {
  defineComponent,
  text,
  type ComponentInput,
  type ComponentLayoutInput,
  type ComponentMeasureInput,
  type ComponentRenderInput,
  type DecorativeLeafComponentDefinition,
  type SemanticLeafComponentDefinition
} from '@ismail-elkorchi/terminal-ui/components';
import {
  renderElementFrame,
  renderFramePlain,
  span,
  type Canvas2D,
  type CanvasPainterInput,
  type FramePassContext,
  type FrameCellSource,
  type Frame,
  type LayoutNode,
  type Rect,
  type RenderInstrumentation,
  type RenderStage,
  type RenderSpan,
  type RenderWorkMeasurement
} from '@ismail-elkorchi/terminal-ui/renderer';

const renderSpan: RenderSpan = span('ready', { style: { bold: true } });
const frame: Frame = renderElementFrame(text('Ready'), { columns: 20, rows: 2 });
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
renderElementFrame(text('Invalid'), { columns: '20', rows: 2 });

const invalidInteractionState: FrameCellSource = {
  // @ts-expect-error frame-cell interaction state is a closed serialization contract
  interactionState: 'busy'
};
const validInteractionState: FrameCellSource = { interactionState: 'focused' };

declare const drawing: Canvas2D;
declare const painterInput: CanvasPainterInput;
drawing.brailleSubcell(0, 0);
painterInput.canvas.point(0, 0, { text: '*' });
const absoluteRect: Rect = { row: 1, column: 1, width: 2, height: 2 };
// @ts-expect-error absolute frame rectangles are not local Canvas2D rectangles
drawing.rect(absoluteRect, { fill: { text: '*' } });
drawing.rect({ x: 0, y: 0, width: 2, height: 2 }, { fill: { text: '*' } });

const writeOnly = defineComponent({
  structure: 'leaf',
  semantics: 'semantic',
  name: 'writeOnly',
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 2, preferredHeight: 1 }),
  render({ target }) {
    target.write(1, 1, [{ text: 'ok' }]);
    // @ts-expect-error component render targets do not expose private frame-buffer reads
    const readCell = target.readCell;
    void readCell;
  },
  accessibility: ({ id }) => ({ id, role: 'text', label: 'write only' })
});
writeOnly({ id: 'write-only-component' });
writeOnly({ id: 'passive-component', availability: 'passive' });
// @ts-expect-error passive components cannot define interaction handlers
writeOnly({
  id: 'invalid-passive-component',
  availability: 'passive',
  keys: { enter: () => undefined }
});

const rendererWithUnsupportedPlacement: SemanticLeafComponentDefinition = {
  structure: 'leaf',
  semantics: 'semantic',
  name: 'placedLeaf',
  parts: [],
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  accessibility: ({ id }) => ({ id, role: 'text', label: id }),
  // @ts-expect-error components cannot take ownership of layout placement
  place: ({ bounds }: { readonly bounds: Rect }) => bounds
};
void rendererWithUnsupportedPlacement;

declare const componentRenderInput: ComponentRenderInput<undefined>;
componentRenderInput.target.write(1, 1, [{ text: 'ok' }]);
declare const componentMeasureInput: ComponentMeasureInput<undefined>;
// @ts-expect-error measurement occurs before viewport resolution
const componentMeasureViewport = componentMeasureInput.viewport;

const decorativeComposite = defineComponent({
  structure: 'composite',
  // @ts-expect-error decorative component definitions must be leaves
  semantics: 'decorative',
  name: 'decorativeStack',
  measure: ({ measureChild }: ComponentMeasureInput<undefined>) => measureChild(0),
  layout: ({ bounds }: ComponentLayoutInput<undefined>) => [bounds]
});
void decorativeComposite;

const interactiveDecoration: DecorativeLeafComponentDefinition = {
  structure: 'leaf',
  semantics: 'decorative',
  name: 'interactiveDecoration',
  parts: [],
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined,
  // @ts-expect-error decorative components cannot expose focus targets
  focusTargets: ({ bounds }: ComponentInput<undefined>) => [{ id: 'self', bounds }]
};
void interactiveDecoration;

const decoration = defineComponent({
  structure: 'leaf',
  semantics: 'decorative',
  name: 'decoration',
  parts: [],
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined
});
decoration({
  id: 'keyed-decoration',
  // @ts-expect-error decorative component instances cannot define key bindings
  keys: { enter: () => ({ kind: 'press' }) }
});

// @ts-expect-error semantic leaf components require an accessibility hook
const missingAccessibility: SemanticLeafComponentDefinition = {
  structure: 'leaf',
  semantics: 'semantic',
  name: 'missingAccessibility',
  parts: [],
  measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }),
  render: () => undefined
};
void missingAccessibility;

// @ts-expect-error semantic composite components require an accessibility hook
const missingCompositeAccessibility: import('@ismail-elkorchi/terminal-ui/components').SemanticCompositeComponentDefinition = {
  structure: 'composite',
  semantics: 'semantic',
  name: 'missingCompositeAccessibility',
  parts: [],
  measure: ({ measureChild }) => measureChild(0),
  layout: ({ bounds }) => [bounds]
};
void missingCompositeAccessibility;

declare const framePassContext: FramePassContext;
const framePassColumns = framePassContext.terminalSize.columns;

// @ts-expect-error ordinary public rendering returns a frame, not its private render node
const privateRenderNode = frame.node;
// @ts-expect-error ordinary public rendering does not return private focus or pointer regions
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
void componentRenderInput;
void componentMeasureViewport;
void framePassColumns;
