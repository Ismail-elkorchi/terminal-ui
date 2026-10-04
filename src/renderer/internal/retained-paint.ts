import { sameReuseDependencies } from '../../visual/reuse-dependencies.ts';
import { sameStyleDependencies } from '../../visual/style-dependencies.ts';
import { sameRect } from '../../geometry/rect.ts';
import type { Rect } from '../../geometry/types.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { RenderTarget } from '../contracts.ts';
import type { RetainedFramePaint } from '../frame-buffer.ts';
import { captureFramePaint, restoreFramePaint } from '../frame-buffer.ts';
import type { RenderRegion } from './render-regions.ts';
import { hitTargetOwnerIdentity } from './render-regions.ts';
import type { RenderNode, RenderNodeRenderInput } from './render-tree/types.ts';

// Only explicitly owned visual descriptors are compared by value. Custom models
// and theme resources remain opaque immutable identities, never object graphs.
interface PaintDependencies {
  readonly definition: unknown;
  readonly id: string | undefined;
  readonly model: readonly unknown[];
  readonly accessibleName: string | undefined;
  readonly styles: unknown;
  readonly theme: unknown;
  readonly textPresentation: unknown;
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
  return a.definition === b.definition && a.id === b.id && sameReuseDependencies(a.model, b.model)
    && a.textPresentation === b.textPresentation
    && a.accessibleName === b.accessibleName && sameStyleDependencies(a.styles, b.styles) && a.theme === b.theme
    && sameRect(a.bounds, b.bounds) && sameRect(a.viewport, b.viewport)
    && a.disabled === b.disabled && a.busy === b.busy && a.readOnly === b.readOnly && a.inert === b.inert
    && a.emoji === b.emoji && a.ambiguous === b.ambiguous && a.focus === b.focus
    && a.focusedTargetId === b.focusedTargetId && a.hoveredTargetId === b.hoveredTargetId
    && a.pressedTargetId === b.pressedTargetId;
}
interface PaintRecord {
  readonly dependencies: PaintDependencies;
  readonly storage: RetainedFramePaint;
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
      if (node.kind !== 'component' || node.props.reuse.paint === undefined
        || node.definition.inspection.structure !== 'leaf') return false;
      const dependencies: PaintDependencies = {
        definition: node.definition, id: node.id, model: node.props.reuse.paint,
        accessibleName: node.props.accessibleName, styles: node.styles, theme: input.theme,
        textPresentation: input.textPresentation,
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
      if (record === undefined || !sameDependencies(record.dependencies, dependencies)
        || !restoreFramePaint(input.buffer, record.storage)) {
        const storage = captureFramePaint(input.buffer, () => { render(input.buffer); });
        if (storage === undefined) return true;
        record = { dependencies, storage };
      }
      next.set(key, record);
      return true;
    },
    commit(regions: readonly RenderRegion[]): void { caches.set(regions, next); },
  };
}
