import { mergeKeyBindings } from '../../element/metadata-normalization.ts';
import { optionalRenderNodeId, requiredRenderNodeId, renderNodeChildren } from '../../renderer/internal/render-tree/element.ts';
import { renderNodeLayoutProps } from '../../renderer/internal/render-tree/props/shared-layout.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type { ElementKeyBindings } from '../../element/metadata.ts';
import { decodeElementStyles } from '../../element/styles.ts';
import { layoutElementFromRenderNode } from '../../renderer/internal/render-tree/element.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/internal/render-tree/metadata.ts';
import type { SplitPaneTransition } from '../../behavior/split-pane.ts';
import type { ResizableSplitPaneOptions, SplitPaneOptions } from '../options.ts';

export function splitPane<
  const TChildren extends ElementChildren,
  const TActionMessage = never
>(
  children: TChildren,
  options: SplitPaneOptions<TActionMessage>
): Element<ElementChildrenMessage<TChildren> | TActionMessage> {
  type Message = ElementChildrenMessage<TChildren> | TActionMessage;
  const renderChildren = renderNodeChildren(children);
  assertSplitPaneOptions(renderChildren.length, options);
  const styles = options.styles === undefined
    ? undefined
    : decodeElementStyles(options.styles, {
        subject: 'splitPane() styles',
        parts: new Set(['divider', 'dividerActive']),
        states: new Set(),
      });
  if (options.onTransition === undefined) {
    return layoutElementFromRenderNode<'splitPane', Message>({
      ...optionalRenderNodeId(options.id),
      kind: 'splitPane',
      props: {
        direction: options.direction,
        ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
        ...renderNodeLayoutProps(options)
      },
      children: renderChildren,
      ...interactionProps({ meta: options.meta, styles })
    });
  }

  const keys = mergeKeyBindings(splitPaneKeyBindings(options), options.keys);
  return layoutElementFromRenderNode<'splitPane', Message>({
    ...requiredRenderNodeId(options.id, 'splitPane'),
    kind: 'splitPane',
    props: {
      direction: options.direction,
      sizes: options.sizes,
      activeDivider: options.activeDivider ?? 0,
      toActionMessage: (transition: SplitPaneTransition) => options.onTransition(transition),
      ...renderNodeLayoutProps({ ...options, gap: options.gap ?? 1 })
    },
    children: renderChildren,
    ...interactionProps({ keys, meta: options.meta, styles })
  });
}

function splitPaneKeyBindings<TMessage>(
  options: ResizableSplitPaneOptions<TMessage>
): ElementKeyBindings<TMessage> {
  const step = normalizedResizeStep(options.resizeStep);
  const transition = options.onTransition;
  const selectPrevious = () => transition({ kind: 'moveActiveDivider', delta: -1 });
  const selectNext = () => transition({ kind: 'moveActiveDivider', delta: 1 });
  const shrinkLeading = () => transition({ kind: 'resizeBy', deltaShare: -step });
  const growLeading = () => transition({ kind: 'resizeBy', deltaShare: step });
  return {
    ...(options.direction === 'horizontal'
      ? {
          arrowLeft: shrinkLeading,
          arrowRight: growLeading,
          arrowUp: selectPrevious,
          arrowDown: selectNext
        }
      : {
          arrowUp: shrinkLeading,
          arrowDown: growLeading,
          arrowLeft: selectPrevious,
          arrowRight: selectNext
        }),
    home: () => transition({ kind: 'firstActiveDivider' }),
    end: () => transition({ kind: 'lastActiveDivider' })
  };
}

function assertSplitPaneOptions<TMessage>(
  childCount: number,
  options: SplitPaneOptions<TMessage>
): void {
  if (childCount === 0) throw new RangeError('splitPane requires at least one child.');
  if (options.sizes !== undefined && options.sizes.length !== childCount) {
    throw new RangeError(`splitPane sizes length ${String(options.sizes.length)} must match child count ${String(childCount)}.`);
  }
  if (options.onTransition === undefined) return;
  if (childCount < 2) throw new RangeError('Resizable splitPane requires at least two children.');
  if ((options.gap ?? 1) < 1) throw new RangeError('Resizable splitPane requires a gap of at least one cell.');
  const active = options.activeDivider ?? 0;
  if (!Number.isInteger(active) || active < 0 || active >= childCount - 1) {
    throw new RangeError(`splitPane activeDivider ${String(active)} must identify an existing divider.`);
  }
}

function normalizedResizeStep(value: number | undefined): number {
  if (value === undefined) return 0.05;
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError('splitPane resizeStep must be greater than 0 and at most 1.');
  }
  return value;
}
