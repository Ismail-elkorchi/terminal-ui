import type { FrameCell } from '../contracts.ts';
import { sameFrameCellSource, sameTerminalLink, sameTerminalStyle } from '../../visual/render-content.ts';

export function sameFrameCell(left: FrameCell | undefined, right: FrameCell | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.text === right.text
    && left.width === right.width
    && (left.continuation === true) === (right.continuation === true)
    && sameTerminalStyle(left.style, right.style)
    && sameTerminalLink(left.link, right.link)
    && sameFrameCellSource(left.source, right.source);
}

export function sameTerminalFrameCell(
  left: FrameCell | undefined,
  right: FrameCell | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.text === right.text
    && left.width === right.width
    && (left.continuation === true) === (right.continuation === true)
    && sameTerminalStyle(left.style, right.style)
    && sameTerminalLink(left.link, right.link);
}
