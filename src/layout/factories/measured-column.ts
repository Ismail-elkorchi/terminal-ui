import type {
  MeasuredWindow,
  MeasuredWindowEntry
} from '../../collection/measured-window.ts';
import type {
  Element,
  ElementMessage
} from '../../element/index.ts';
import type { StructuralElementOptions } from '../../element/metadata.ts';
import type { MeasuredViewportOptions } from '../options.ts';
import {
  layoutElementFromRenderNode,
  optionalRenderNodeId,
  requiredRenderNodeId,
  toRenderNode
} from '../../renderer/internal/render-tree/element.ts';
import { renderNodeInteraction, renderNodeMeta } from '../../renderer/internal/render-tree/metadata.ts';
import { isMeasuredWindow } from '../../collection/measured-window-operations.ts';
import { renderNodeLayoutProps } from '../../renderer/internal/render-tree/props/shared-layout.ts';
import { assertOptionalEnum } from '../../foundation/validation.ts';

/** @beta */
export function measuredColumn<
  TValue,
  const TElement extends Element<unknown>
>(
  window: MeasuredWindow<TValue>,
  renderEntry: (entry: MeasuredWindowEntry<TValue>) => TElement,
  options: StructuralElementOptions = {}
): Element<ElementMessage<TElement>> {
  if (!isMeasuredWindow(window)) {
    throw new TypeError('measuredColumn() window must be created with measuredWindow().');
  }
  if (typeof renderEntry !== 'function') {
    throw new TypeError('measuredColumn() renderEntry must be a function.');
  }
  const children = window.entries.map((entry) => toRenderNode(renderEntry(entry)));
  return layoutElementFromRenderNode<'measuredColumn', ElementMessage<TElement>>({
    ...optionalRenderNodeId(options.id),
    kind: 'measuredColumn',
    props: {
      entries: window.entries.map((entry) => ({
        rowOffset: window.offsetRow + entry.rowOffset,
        clippedRowsBefore: entry.clippedRowsBefore,
        rows: entry.item.rows
      })),
      totalRows: window.totalRows
    },
    children,
    ...renderNodeMeta(options)
  });
}

export function measuredItemViewport<const TElement extends Element<unknown>>(
  child: TElement,
  geometry: {
    readonly rows: number;
    readonly clippedRowsBefore: number;
    readonly visibleRows: number;
  }
): Element<ElementMessage<TElement>> {
  return layoutElementFromRenderNode<'measuredColumn', ElementMessage<TElement>>({
    kind: 'measuredColumn',
    props: {
      entries: [{
        rowOffset: 0,
        clippedRowsBefore: geometry.clippedRowsBefore,
        rows: geometry.rows
      }],
      totalRows: geometry.visibleRows
    },
    children: [toRenderNode(child)]
  });
}

/**
 * Measures retained elements at the final content width and lays out the
 * visible entries. Replace an element when its measurement inputs change.
 *
 * @beta
 */
export function measuredViewport<
  const TElement extends Element<unknown>,
  const TMessage,
>(
  entries: readonly TElement[],
  options: MeasuredViewportOptions<TMessage>,
): Element<ElementMessage<TElement> | TMessage> {
  if (!Array.isArray(entries)) throw new TypeError('measuredViewport() entries must be an array of elements.');
  assertOptionalEnum(options.scrollbar?.axis, ['vertical'], 'measuredViewport() scrollbar axis');
  if (options.offset !== undefined && 'column' in options.offset) {
    throw new TypeError('measuredViewport() only supports vertical scrolling.');
  }
  return layoutElementFromRenderNode<'viewport', ElementMessage<TElement> | TMessage>({
    ...requiredRenderNodeId(options.id, 'measuredViewport'),
    kind: 'viewport',
    props: {
      measured: true,
      ...(options.followTail === undefined ? {} : { followTail: options.followTail }),
      ...(options.anchor === undefined ? {} : { anchor: options.anchor }),
      ...(options.onLayout === undefined ? {} : { onLayout: options.onLayout }),
      constrainWidth: true,
      ...(options.offset?.row === undefined ? {} : { offsetRow: options.offset.row }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: { ...options.scrollbar, axis: 'vertical' } }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.keyboardScroll === undefined ? {} : { keyboardScroll: options.keyboardScroll }),
      toScrollMessage: options.onScroll,
      ...renderNodeLayoutProps(options),
    },
    children: entries.map((entry: TElement) => toRenderNode<TElement>(entry)),
    ...renderNodeInteraction(options),
  });
}
