import { applyRenderDiff as applyInternalRenderDiff } from '../renderer/internal/diff-interpreter.ts';
import type { RenderDiffProjection } from '../renderer/internal/diff-interpreter.ts';
import type { RenderDiff } from '../renderer/model/diff.ts';
import type { Frame } from '../renderer/model/frame.ts';

export type { RenderDiffProjection } from '../renderer/internal/diff-interpreter.ts';

export function applyRenderDiff(
  previous: Frame | RenderDiffProjection | undefined,
  diff: RenderDiff
): RenderDiffProjection {
  return applyInternalRenderDiff(previous, diff);
}
