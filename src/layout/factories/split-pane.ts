import { mergeKeyBindings } from '../../authoring/metadata.ts';
import { layoutProps, optionalId, requiredId, renderNodeChildren } from '../../authoring/render-node.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type { ElementKeyBindings } from '../../element/metadata.ts';
import { elementFromRenderNode } from '../../renderer/model/element.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import type { SplitPaneAction } from '../../ui-model/split-pane.ts';
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
  if (options.onAction === undefined) {
    return elementFromRenderNode<'splitPane', Message>({
      ...optionalId(options.id),
      kind: 'splitPane',
      props: {
        direction: options.direction,
        ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
        ...layoutProps(options)
      },
      children: renderChildren,
      ...interactionProps({ meta: options.meta })
    });
  }

  const keys = mergeKeyBindings(splitPaneKeyBindings(options), options.keys);
  return elementFromRenderNode<'splitPane', Message>({
    ...requiredId(options.id, 'splitPane'),
    kind: 'splitPane',
    props: {
      direction: options.direction,
      sizes: options.sizes,
      selectedDivider: options.selectedDivider ?? 0,
      toActionMessage: (action: SplitPaneAction) => options.onAction(action),
      ...layoutProps({ ...options, gap: options.gap ?? 1 })
    },
    children: renderChildren,
    ...interactionProps({ keys, meta: options.meta })
  });
}

function splitPaneKeyBindings<TMessage>(
  options: ResizableSplitPaneOptions<TMessage>
): ElementKeyBindings<TMessage> {
  const step = normalizedResizeStep(options.resizeStep);
  const action = options.onAction;
  const selectPrevious = () => action({ kind: 'moveDividerSelection', delta: -1 });
  const selectNext = () => action({ kind: 'moveDividerSelection', delta: 1 });
  const shrinkLeading = () => action({ kind: 'resizeBy', deltaShare: -step });
  const growLeading = () => action({ kind: 'resizeBy', deltaShare: step });
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
    home: () => action({ kind: 'selectFirstDivider' }),
    end: () => action({ kind: 'selectLastDivider' })
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
  if (options.onAction === undefined) return;
  if (childCount < 2) throw new RangeError('Resizable splitPane requires at least two children.');
  if ((options.gap ?? 1) < 1) throw new RangeError('Resizable splitPane requires a gap of at least one cell.');
  const selected = options.selectedDivider ?? 0;
  if (!Number.isInteger(selected) || selected < 0 || selected >= childCount - 1) {
    throw new RangeError(`splitPane selectedDivider ${String(selected)} must identify an existing divider.`);
  }
}

function normalizedResizeStep(value: number | undefined): number {
  if (value === undefined) return 0.05;
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError('splitPane resizeStep must be greater than 0 and at most 1.');
  }
  return value;
}
