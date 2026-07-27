import { text } from '@ismail-elkorchi/terminal-ui/components';
import {
  custom,
  type CustomRendererRenderInput
} from '@ismail-elkorchi/terminal-ui/component';
import {
  renderElementFrame,
  renderFramePlain,
  span,
  type Canvas2D,
  type FramePassContext,
  type FrameCellSource,
  type Frame,
  type Rect,
  type RenderStage,
  type RenderSpan
} from '@ismail-elkorchi/terminal-ui/renderer';

const renderSpan: RenderSpan = span('ready', { style: { bold: true } });
const frame: Frame = renderElementFrame(text('Ready'), { columns: 20, rows: 2 });
const plain = renderFramePlain(frame);
const renderStage: RenderStage = 'resolve_element';

// @ts-expect-error render bounds use terminal cell numbers
renderElementFrame(text('Invalid'), { columns: '20', rows: 2 });

const invalidInteractionState: FrameCellSource = {
  // @ts-expect-error frame-cell interaction state is a closed serialization contract
  interactionState: 'busy'
};
const validInteractionState: FrameCellSource = { interactionState: 'focused' };

declare const drawing: Canvas2D;
drawing.brailleSubcell(0, 0);
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
declare const framePassContext: FramePassContext;
const framePassColumns = framePassContext.terminalSize.columns;

// @ts-expect-error ordinary public rendering returns a frame, not its private render node
const privateRenderNode = frame.node;
// @ts-expect-error ordinary public rendering does not return private focus or pointer regions
const privateRegions = frame.regions;

void renderSpan;
void renderStage;
void plain;
void invalidInteractionState;
void validInteractionState;
void privateRenderNode;
void privateRegions;
void customRenderInput;
void framePassColumns;
