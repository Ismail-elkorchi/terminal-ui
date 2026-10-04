import type { ComponentRenderInput } from '../../component/contracts.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { RenderSpan } from '../../visual/render-content.ts';

/** Paint logical trailing space without constructing text outside the writable viewport. */
export function paintControlPadding(
  input: Pick<ComponentRenderInput<object>, 'bounds' | 'viewport' | 'target'>,
  row: number,
  column: number,
  width: number,
  options: Omit<RenderSpan, 'text'>,
): void {
  if (width <= 0) return;
  const visible = intersectRects(input.bounds, input.viewport);
  if (visible === undefined) return;
  const padding = intersectRects({ row, column, width, height: 1 }, visible);
  if (padding === undefined) return;
  input.target.write(padding.row, padding.column, [{ ...options, text: ' '.repeat(padding.width) }]);
}
