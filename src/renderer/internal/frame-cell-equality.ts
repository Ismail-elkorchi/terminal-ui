import { sameFrameCellSource } from '../../visual/frame-source.ts';
import { sameTerminalLink, sameTerminalStyle } from '../../visual/render-content.ts';
import type { FrameCell } from '../contracts.ts';

export function sameFrameCell(left: FrameCell | undefined, right: FrameCell | undefined): boolean {
  if (left === right) return true;
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
  if (left === right) return true;
  if (left === undefined || right === undefined) return left === right;
  return left.text === right.text
    && left.width === right.width
    && (left.continuation === true) === (right.continuation === true)
    && sameTerminalStyle(left.style, right.style)
    && sameTerminalLink(left.link, right.link);
}
