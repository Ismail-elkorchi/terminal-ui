import type { Element } from '../element/types.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { Frame } from './contracts.ts';
import { renderElementInternal } from './internal/render-element.ts';
import type { RenderElementOptions } from './render-options.ts';

export function renderElementFrame(
  element: Element<unknown>,
  terminalSize: TerminalSize,
  options: RenderElementOptions = {},
): Frame {
  return renderElementInternal(element, terminalSize, options).frame;
}
