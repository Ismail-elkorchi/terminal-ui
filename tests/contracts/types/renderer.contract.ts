import { text } from '@ismail-elkorchi/terminal-ui/components';
import {
  renderElementFrame,
  renderFramePlain,
  span,
  type Frame,
  type RenderSpan
} from '@ismail-elkorchi/terminal-ui/renderer';

const renderSpan: RenderSpan = span('ready', { style: { bold: true } });
const frame: Frame = renderElementFrame(text('Ready'), { columns: 20, rows: 2 });
const plain = renderFramePlain(frame);

// @ts-expect-error render bounds use terminal cell numbers
renderElementFrame(text('Invalid'), { columns: '20', rows: 2 });

void renderSpan;
void plain;
