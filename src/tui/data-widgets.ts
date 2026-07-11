import type { AccessibleNode } from '../accessibility/index.ts';
import type { PaginatorAction } from '../components/paginator.ts';
import type { RenderNodeOfKind } from '../render-node/index.ts';
import { terminalTextWidth } from '../text/index.ts';
import { dataSource, dataSpan } from './data-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { resolveRenderNodeStyle } from './render-node-style.ts';
import type { Rect } from './layout.ts';
import type { HitTarget } from './render-node-renderer.ts';
import type { RenderBlock, RenderSpan } from './render-primitives.ts';

interface PaginatorParts {
  readonly label: string;
  readonly page: number;
  readonly pageCount: number;
}

interface PaginatorLayout {
  readonly spans: readonly RenderSpan[];
  readonly controls: readonly PaginatorControl[];
}

interface PaginatorControl {
  readonly label: string;
  readonly action: PaginatorAction;
  readonly offset: number;
  readonly width: number;
  readonly disabled: boolean;
}

type PaginatorNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'paginator'>;

export function paginatorText(widget: PaginatorNode): string {
  return paginatorLayout(widget).spans.map((item) => item.text).join('');
}

export function paginatorBlock(widget: PaginatorNode): RenderBlock {
  return { lines: [{ spans: paginatorLayout(widget).spans }] };
}

export function paginatorAccessibleBase(widget: PaginatorNode, id: string, focused: boolean): AccessibleNode {
  const parts = paginatorParts(widget);
  const controls = paginatorLayout(widget).controls;
  return {
    id,
    role: controls.length === 0 ? 'status' : 'application',
    label: parts.label || id,
    value: `Page ${String(parts.page)} of ${String(parts.pageCount)}`,
    ...(focused ? { focused: true } : {}),
    ...(controls.length === 0
      ? {}
      : {
          children: controls.map((control) => ({
            id: `${id}:${control.action.kind}`,
            role: 'button' as const,
            label: control.label,
            ...(control.disabled ? { disabled: true } : {})
          }))
        })
  };
}

export function paginatorHitTargets<TMessage>(
  widget: PaginatorNode<TMessage>,
  bounds: Rect
): readonly HitTarget<TMessage>[] {
  const onAction = widget.props.toActionMessage;
  if (onAction === undefined || bounds.height <= 0) return [];
  return paginatorLayout(widget).controls.flatMap((control): readonly HitTarget<TMessage>[] => control.disabled
    ? []
    : [{
        id: `${widget.id ?? widget.kind}:${control.action.kind}`,
        bounds: {
          row: bounds.row,
          column: bounds.column + control.offset,
          width: Math.min(control.width, Math.max(0, bounds.width - control.offset)),
          height: 1
        },
        message: () => onAction(control.action),
        cursor: 'pointer'
      }]);
}

function paginatorLayout(widget: PaginatorNode): PaginatorLayout {
  const parts = paginatorParts(widget);
  const spans: RenderSpan[] = [];
  const controls: PaginatorControl[] = [];
  let offset = 0;
  const append = (text: string, label: string, style = resolveRenderNodeStyle(widget, { part: 'label' })): void => {
    spans.push(dataSpan(text, style, dataSource(widget, label)));
    offset += terminalTextWidth(text);
  };
  const appendControl = (
    text: string,
    label: string,
    action: PaginatorAction,
    disabled: boolean
  ): void => {
    const width = terminalTextWidth(text);
    controls.push({ label, action, offset, width, disabled });
    append(text, `control.${action.kind}`, resolveRenderNodeStyle(widget, {
      part: 'control',
      ...(disabled ? { state: 'disabled' } : {})
    }));
  };

  if (parts.label.length > 0) {
    append(parts.label, 'label');
    append(' ', 'label.gap');
  }
  if (widget.props.toActionMessage !== undefined) {
    const atFirst = parts.page <= 1;
    appendControl('[«]', 'First page', { kind: 'first' }, atFirst);
    append(' ', 'control.gap.first');
    appendControl('[‹]', 'Previous page', { kind: 'previous' }, atFirst);
    append(' ', 'control.gap.previous');
  }
  append('Page ', 'page.label');
  append(String(parts.page), 'page.value', resolveRenderNodeStyle(widget, { part: 'value' }));
  append(' of ', 'page.separator', resolveRenderNodeStyle(widget, { part: 'separator' }));
  append(String(parts.pageCount), 'page.count', resolveRenderNodeStyle(widget, { part: 'value' }));
  if (widget.props.toActionMessage !== undefined) {
    const atLast = parts.page >= parts.pageCount;
    append(' ', 'control.gap.next');
    appendControl('[›]', 'Next page', { kind: 'next' }, atLast);
    append(' ', 'control.gap.last');
    appendControl('[»]', 'Last page', { kind: 'last' }, atLast);
  }
  return { spans, controls };
}

function paginatorParts(widget: PaginatorNode): PaginatorParts {
  const pageCount = normalizedCount(numberProp(widget, 'pageCount') ?? 1);
  return {
    label: stringify(widget.props.label),
    page: Math.max(1, Math.min(pageCount, Math.floor(numberProp(widget, 'page') ?? 1))),
    pageCount
  };
}

function normalizedCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}
