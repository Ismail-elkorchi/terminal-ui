import { scrollReducer } from '../behavior/scroll.ts';
import { focusPathsEqual } from '../interaction/focus.ts';
import type { FocusPath } from '../interaction/focus.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import type { ScrollGeometry, ScrollState } from '../interaction/scroll.ts';
import {
  collectLayoutFocusTargets,
  collectRenderNodeLayoutTargets,
} from '../renderer/internal/focus.ts';
import {
  scrollbarsForRenderNode,
  viewportScrollbarState,
} from '../renderer/internal/node-renderers/support/scroll.ts';
import type { LayoutNode } from '../renderer/contracts.ts';
import type { RenderNode, RenderNodeOfKind } from '../renderer/internal/render-tree/index.ts';
import { resolveRenderNodeMessage } from '../renderer/internal/render-tree/node.ts';

export function focusRevealMessages<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  focusPath: FocusPath | undefined,
): readonly TMessage[] {
  if (focusPath === undefined) return [];
  const target = collectLayoutFocusTargets(layout)
    .find((candidate) => focusPathsEqual(candidate.path, focusPath));
  if (target === undefined) return [];
  const viewports = collectRenderNodeLayoutTargets(renderNode, layout)
    .filter((candidate): candidate is typeof candidate & {
      readonly renderNode: RenderNodeOfKind<TMessage, 'viewport'>;
    } => candidate.renderNode.kind === 'viewport'
      && typeof candidate.renderNode.props.toScrollMessage === 'function'
      && pathStartsWith(focusPath, candidate.path))
    .toSorted((left, right) => right.path.length - left.path.length);
  const messages: TMessage[] = [];
  let revealBounds = target.logicalBounds;
  for (const viewport of viewports) {
    const plan = scrollbarsForRenderNode(
      viewport.renderNode,
      viewport.layoutNode.bounds,
      (bounds) => viewportScrollbarState(viewport.renderNode, bounds, viewport.layoutNode),
      'both',
    );
    const current: ScrollState = {
      offsetRow: plan.state.offsetRow,
      offsetColumn: plan.state.offsetColumn,
      followTail: false,
    };
    const geometry: ScrollGeometry = {
      contentRows: plan.state.contentRows,
      contentColumns: plan.state.contentColumns,
      viewportRows: plan.contentBounds.height,
      viewportColumns: plan.contentBounds.width,
    };
    const nextState = scrollReducer(current, {
      kind: 'setOffset',
      rows: revealedOffset(
        current.offsetRow,
        revealBounds.row,
        revealBounds.height,
        plan.contentBounds.row,
        plan.contentBounds.height,
      ),
      columns: revealedOffset(
        current.offsetColumn,
        revealBounds.column,
        revealBounds.width,
        plan.contentBounds.column,
        plan.contentBounds.width,
      ),
    }, geometry);
    if (nextState.offsetRow !== current.offsetRow || nextState.offsetColumn !== current.offsetColumn) {
      const toMessage = viewport.renderNode.props.toScrollMessage;
      if (toMessage !== undefined) {
        const message = resolveRenderNodeMessage(viewport.renderNode, toMessage({
          nextState,
          source: 'focus',
          target: 'content',
        }));
        if (!isIgnoredMessage(message)) messages.push(message as TMessage);
      }
    }
    revealBounds = viewport.layoutNode.bounds;
  }
  return messages;
}

function revealedOffset(
  offset: number,
  targetStart: number,
  targetSize: number,
  viewportStart: number,
  viewportSize: number,
): number {
  if (targetSize >= viewportSize) return offset + targetStart - viewportStart;
  if (targetStart < viewportStart) return offset - (viewportStart - targetStart);
  const targetEnd = targetStart + targetSize;
  const viewportEnd = viewportStart + viewportSize;
  return targetEnd > viewportEnd ? offset + targetEnd - viewportEnd : offset;
}

function pathStartsWith(path: FocusPath, prefix: FocusPath): boolean {
  return path.length >= prefix.length
    && prefix.every((segment, index) => path[index] === segment);
}
