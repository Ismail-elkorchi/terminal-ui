import { sameRect } from '../../geometry/rect.ts';
import type { Rect } from '../../geometry/types.ts';
import type { GraphicPlacementInput } from '../../graphics/types.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { FrameCell, RenderTarget } from '../contracts.ts';
import type { FrameBufferSpan } from '../frame-buffer.ts';
import {
  recordTargetSegmentation,
  registerSpanTarget,
  transferFrameBufferSpans,
  transferFrameCell,
} from '../frame-buffer.ts';
import type { RenderRegion } from './render-regions.ts';
import { hitTargetOwnerIdentity } from './render-regions.ts';
import type { RenderNode, RenderNodeRenderInput } from './render-tree/types.ts';

type PaintOperation =
  | { readonly kind: 'spans'; readonly row: number; readonly column: number; readonly spans: readonly FrameBufferSpan[] }
  | { readonly kind: 'cell'; readonly cell: FrameCell }
  | { readonly kind: 'clear'; readonly rect?: Rect }
  | { readonly kind: 'graphic'; readonly placement: GraphicPlacementInput };
// Only fixed renderer-owned descriptors are compared by value. Component models,
// styles and theme resources are opaque immutable identities, never object graphs.
interface PaintDependencies {
  readonly definition: unknown;
  readonly id: string | undefined;
  readonly model: unknown;
  readonly accessibleName: string | undefined;
  readonly styles: unknown;
  readonly theme: unknown;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly readOnly: boolean;
  readonly inert: boolean;
  readonly emoji: string;
  readonly ambiguous: string;
  readonly focus: RenderNodeRenderInput['focus'];
  readonly focusedTargetId: string | undefined;
  readonly hoveredTargetId: string | undefined;
  readonly pressedTargetId: string | undefined;
}

function sameDependencies(a: PaintDependencies, b: PaintDependencies): boolean {
  return a.definition === b.definition && a.id === b.id && Object.is(a.model, b.model)
    && a.accessibleName === b.accessibleName && a.styles === b.styles && a.theme === b.theme
    && sameRect(a.bounds, b.bounds) && sameRect(a.viewport, b.viewport)
    && a.disabled === b.disabled && a.busy === b.busy && a.readOnly === b.readOnly && a.inert === b.inert
    && a.emoji === b.emoji && a.ambiguous === b.ambiguous && a.focus === b.focus
    && a.focusedTargetId === b.focusedTargetId && a.hoveredTargetId === b.hoveredTargetId
    && a.pressedTargetId === b.pressedTargetId;
}
interface PaintRecord {
  readonly dependencies: PaintDependencies;
  readonly operations: readonly PaintOperation[];
}
const caches = new WeakMap<readonly RenderRegion[], ReadonlyMap<string, PaintRecord>>();

export function createPaintRetention(previous?: readonly RenderRegion[]) {
  const prior = previous === undefined ? undefined : caches.get(previous);
  const next = new Map<string, PaintRecord>();
  return {
    keep(node: RenderNode, identity: string, path: FocusPath): void {
      if (node.kind !== 'component') return;
      const key = hitTargetOwnerIdentity(path, identity);
      const record = prior?.get(key);
      if (record !== undefined) next.set(key, record);
    },
    paint(
      input: Omit<RenderNodeRenderInput, 'renderChildren'>,
      path: FocusPath,
      render: (target: RenderTarget) => void,
    ): boolean {
      const node = input.renderNode as RenderNode;
      if (node.kind !== 'component' || node.definition.renderer.retainPaint !== true) return false;
      const dependencies: PaintDependencies = {
        definition: node.definition, id: node.id, model: node.props.model,
        accessibleName: node.props.accessibleName, styles: node.styles, theme: input.theme,
        bounds: input.layoutNode.bounds, viewport: input.layoutNode.viewport,
        disabled: node.state?.disabled === true, busy: node.state?.busy === true,
        readOnly: node.state?.readOnly === true, inert: node.state?.inert === true,
        emoji: input.widthProfile.emoji, ambiguous: input.widthProfile.ambiguous,
        focus: input.focus, focusedTargetId: input.focusedTargetId,
        hoveredTargetId: input.pointerState?.hoveredTargetId,
        pressedTargetId: input.pointerState?.pressedTargetId,
      };
      const key = hitTargetOwnerIdentity(path, input.layoutNode.identity);
      let record = prior?.get(key);
      if (record !== undefined && sameDependencies(record.dependencies, dependencies)) {
        for (const operation of record.operations) replay(input.buffer, operation);
      } else {
        const operations: PaintOperation[] = [];
        render(recordingTarget(input.buffer, operations));
        record = { dependencies, operations };
      }
      next.set(key, record);
      return true;
    },
    commit(regions: readonly RenderRegion[]): void { caches.set(regions, next); },
  };
}

function replay(target: RenderTarget, operation: PaintOperation): void {
  switch (operation.kind) {
    case 'spans': transferFrameBufferSpans(target, operation.row, operation.column, operation.spans); break;
    case 'cell': transferFrameCell(target, operation.cell); break;
    case 'clear': target.clear(operation.rect); break;
    case 'graphic': target.placeGraphic(operation.placement); break;
  }
}

/** Record admitted drawing commands during the real paint: no extra buffers or snapshots. */
function recordingTarget(target: RenderTarget, operations: PaintOperation[]): RenderTarget {
  const record = (operation: PaintOperation): void => { operations.push(operation); replay(target, operation); };
  return registerSpanTarget({
    ...(target.coordinateSpace === undefined ? {} : { coordinateSpace: target.coordinateSpace }),
    width: target.width, height: target.height, widthProfile: target.widthProfile,
    write(row, column, spans) { target.write(row, column, spans); },
    writeLine(row, column, line) { target.writeLine(row, column, line); },
    writeBlock(row, column, block) { target.writeBlock(row, column, block); },
    writeCell(cell) { target.writeCell(cell); },
    clear(rect) { record({ kind: 'clear', ...(rect === undefined ? {} : { rect: Object.freeze({ ...rect }) }) }); },
    placeGraphic(placement) { record({ kind: 'graphic', placement }); },
  }, {
    transfer(row, column, spans) { record({ kind: 'spans', row, column, spans }); },
    cell(cell) { record({ kind: 'cell', cell }); },
    segmented(codeUnits) { recordTargetSegmentation(target, codeUnits); },
  });
}
