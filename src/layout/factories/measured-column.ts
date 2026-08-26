import type {
  MeasuredWindow,
  MeasuredWindowEntry
} from '../../collection/measured-window.ts';
import type {
  Element,
  ElementMessage
} from '../../element/index.ts';
import type { StructuralElementOptions } from '../../element/metadata.ts';
import type { ScrollableViewportOptions } from '../options.ts';
import {
  layoutElementFromRenderNode,
  optionalRenderNodeId,
  toRenderNode
} from '../../renderer/internal/render-tree/element.ts';
import { renderNodeMeta } from '../../renderer/internal/render-tree/metadata.ts';
import { isMeasuredWindow } from '../../collection/measured-window-operations.ts';
import { viewport } from './viewport.ts';

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
 * Projects a measured window into a passive, controlled virtual
 * viewport without adding collection selection or activation semantics.
 *
 * @beta
 */
export function measuredViewport<
  TValue,
  const TElement extends Element<unknown>,
  const TMessage,
>(
  window: MeasuredWindow<TValue>,
  renderEntry: (entry: MeasuredWindowEntry<TValue>) => TElement,
  options: Omit<ScrollableViewportOptions<TMessage>, 'offset'>,
): Element<ElementMessage<TElement> | TMessage> {
  return viewport(measuredColumn(window, renderEntry), {
    ...options,
    offset: { row: window.offsetRow },
  });
}
