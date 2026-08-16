import type {
  MeasuredWindow,
  MeasuredWindowEntry
} from '../../ui-model/measured-window.ts';
import type {
  Element,
  ElementMessage
} from '../../element/index.ts';
import type { ElementOptions } from '../../element/metadata.ts';
import {
  layoutElementFromRenderNode,
  optionalRenderNodeId,
  toRenderNode
} from '../../renderer/model/element.ts';
import { renderNodeMeta } from '../../renderer/model/metadata.ts';

export function measuredColumn<
  TValue,
  const TElement extends Element<unknown>
>(
  window: MeasuredWindow<TValue>,
  renderEntry: (entry: MeasuredWindowEntry<TValue>) => TElement,
  options: ElementOptions = {}
): Element<ElementMessage<TElement>> {
  if (typeof renderEntry !== 'function') {
    throw new TypeError('measuredColumn() renderEntry must be a function.');
  }
  const children = window.entries.map((entry) => toRenderNode(renderEntry(entry)));
  return layoutElementFromRenderNode<'measuredColumn', ElementMessage<TElement>>({
    ...optionalRenderNodeId(options.id),
    kind: 'measuredColumn',
    props: {
      entries: window.entries.map((entry) => ({
        rowOffset: entry.rowOffset,
        clippedRowsBefore: entry.clippedRowsBefore,
        rows: entry.item.rows
      })),
      viewportRows: window.viewportRows
    },
    children,
    ...renderNodeMeta(options.meta)
  });
}
