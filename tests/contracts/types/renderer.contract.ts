import { text } from '@ismail-elkorchi/terminal-ui/components';
import {
  custom,
  customComposite,
  type CustomCompositeInput,
  type CustomCompositeMeasureInput,
  type CustomRendererInput,
  type CustomRendererMeasureInput,
  type CustomRendererRenderInput,
  type DecorativeCustomCompositeRenderer,
  type DecorativeCustomRenderer
} from '@ismail-elkorchi/terminal-ui/component';
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

custom({
  id: 'write-only-custom-renderer',
  renderer: {
    render({ target }) {
      target.write(1, 1, [{ text: 'ok' }]);
      // @ts-expect-error public custom render targets do not expose private frame-buffer reads
      const readCell = target.readCell;
      void readCell;
    },
    accessibility: ({ id }) => ({ id, role: 'text', label: 'write only' })
  }
});

declare const customRenderInput: CustomRendererRenderInput<undefined>;
customRenderInput.target.write(1, 1, [{ text: 'ok' }]);
declare const customMeasureInput: CustomRendererMeasureInput<undefined>;
// @ts-expect-error measurement occurs before viewport resolution
const customMeasureViewport = customMeasureInput.viewport;
declare const compositeMeasureInput: CustomCompositeMeasureInput<undefined>;
// @ts-expect-error composite measurement occurs before viewport resolution
const compositeMeasureViewport = compositeMeasureInput.viewport;
customComposite({
  id: 'decorative-composite-contract',
  children: [text('Decoration')],
  renderer: {
    layout: ({ bounds }) => [bounds]
  },
  meta: { accessibility: { decorative: true } }
});
const interactiveDecorativeRenderer: DecorativeCustomRenderer = {
  render() {
    return;
  },
  // @ts-expect-error decorative custom renderers cannot expose focus targets
  focusTargets: ({ bounds }: CustomRendererInput<undefined>) => [{ id: 'self', bounds }]
};
// @ts-expect-error decorative custom elements cannot define key bindings
custom({
  id: 'keyed-decorative-custom',
  renderer: {
    render() {
      return;
    }
  },
  keys: {
    enter: () => ({ kind: 'press' })
  },
  meta: { accessibility: { decorative: true } }
});
const interactiveDecorativeCompositeRenderer: DecorativeCustomCompositeRenderer = {
  layout: ({ bounds }) => [bounds],
  // @ts-expect-error decorative custom composites cannot expose hit targets
  hitTargets: ({ bounds }: CustomCompositeInput<undefined>) => [{
    id: 'hit',
    bounds,
    message: () => ({ kind: 'press' })
  }]
};
// @ts-expect-error semantic custom renderers require an accessibility hook
custom({
  id: 'missing-custom-accessibility',
  renderer: {
    render() {
      return;
    }
  }
});
// @ts-expect-error semantic custom composites require an accessibility hook
customComposite({
  id: 'missing-composite-accessibility',
  children: [text('Semantic content')],
  renderer: {
    layout: ({ bounds }) => [bounds]
  }
});
declare const framePassContext: FramePassContext;
const framePassColumns = framePassContext.terminalSize.columns;

// @ts-expect-error ordinary public rendering returns a frame, not its private render node
const privateRenderNode = frame.node;
// @ts-expect-error ordinary public rendering does not return private focus or pointer regions
const privateRegions = frame.regions;

void renderSpan;
void instrumentation;
void layoutLayerId;
void painterInput;
void renderStage;
void plain;
void invalidInteractionState;
void validInteractionState;
void privateRenderNode;
void privateRegions;
void customRenderInput;
void customMeasureViewport;
void compositeMeasureViewport;
void interactiveDecorativeRenderer;
void interactiveDecorativeCompositeRenderer;
void framePassColumns;
