import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget } from '../widgets/index.ts';

export function paginatorText(widget: Widget): string {
  const pageCount = normalizedCount(numberProp(widget, 'pageCount') ?? 1);
  const page = Math.max(1, Math.min(pageCount, Math.floor(numberProp(widget, 'page') ?? 1)));
  const label = stringify(widget.props['label']);
  const prefix = label.length === 0 ? '' : `${label} `;
  return `${prefix}Page ${String(page)} of ${String(pageCount)}`;
}

export function paginatorAccessibleBase(widget: Widget, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: paginatorText(widget)
  };
}

function normalizedCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}
