import { numberProp, stringify } from './render-node-props.ts';
import { renderNodeStyle } from './render-node-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { RenderNode } from '../render-node/index.ts';
import { dataSource, dataSpan } from './data-visual.ts';
import type { RenderBlock, RenderSpan } from './render-primitives.ts';

interface PaginatorParts {
  readonly label: string;
  readonly page: number;
  readonly pageCount: number;
}

export function paginatorText(widget: RenderNode): string {
  const parts = paginatorParts(widget);
  const prefix = parts.label.length === 0 ? '' : `${parts.label} `;
  return `${prefix}Page ${String(parts.page)} of ${String(parts.pageCount)}`;
}

export function paginatorBlock(widget: RenderNode): RenderBlock {
  const parts = paginatorParts(widget);
  const spans: RenderSpan[] = [];
  if (parts.label.length > 0) {
    spans.push(
      dataSpan(parts.label, renderNodeStyle(widget, 'label'), dataSource(widget, 'label')),
      dataSpan(' ', undefined, dataSource(widget, 'label.gap', { role: 'decoration' }))
    );
  }
  spans.push(
    dataSpan('Page ', renderNodeStyle(widget, 'label'), dataSource(widget, 'page.label')),
    dataSpan(String(parts.page), renderNodeStyle(widget, 'value'), dataSource(widget, 'page.value')),
    dataSpan(' of ', undefined, dataSource(widget, 'page.separator', { role: 'separator' })),
    dataSpan(String(parts.pageCount), renderNodeStyle(widget, 'value'), dataSource(widget, 'page.count'))
  );
  return { lines: [{ spans }] };
}

export function paginatorAccessibleBase(widget: RenderNode, id: string): AccessibleNode {
  return {
    id,
    role: 'status',
    label: id,
    value: paginatorText(widget)
  };
}

function paginatorParts(widget: RenderNode): PaginatorParts {
  const pageCount = normalizedCount(numberProp(widget, 'pageCount') ?? 1);
  return {
    label: stringify(widget.props['label']),
    page: Math.max(1, Math.min(pageCount, Math.floor(numberProp(widget, 'page') ?? 1))),
    pageCount
  };
}

function normalizedCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}
