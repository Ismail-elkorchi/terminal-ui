import type { AccessibleNode } from '../../accessibility/index.ts';
import type { PaginatorAction } from '../../ui-model/paginator.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import { terminalTextWidth } from '../../text/index.ts';
import { dataSource, dataSpan } from './data-visual.ts';
import { numberProp, stringify } from './render-node-props.ts';
import { resolveRenderNodeStyle } from './render-node-style.ts';
import type { Rect } from '../model/layout.ts';
import type { HitTarget } from '../model/renderer.ts';
import type { RenderBlock, RenderSpan } from '../../visual/render.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';
import type { TextWidthProfile } from '../../text/index.ts';

interface PaginatorParts {
  readonly label: string;
  readonly pageNumber: number;
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

export function paginatorText(renderNode: PaginatorNode, widthProfile: TextWidthProfile): string {
  return paginatorLayout(renderNode, widthProfile).spans.map((item) => item.text).join('');
}

export function paginatorBlock(renderNode: PaginatorNode, widthProfile: TextWidthProfile): RenderBlock {
  return { lines: [{ spans: paginatorLayout(renderNode, widthProfile).spans }] };
}

export function paginatorAccessibleBase(
  renderNode: PaginatorNode,
  id: string,
  focused: boolean,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const parts = paginatorParts(renderNode);
  const controls = paginatorLayout(renderNode, widthProfile).controls;
  return {
    id,
    role: controls.length === 0 ? 'status' : 'navigation',
    label: parts.label || id,
    value: `Page ${String(parts.pageNumber)} of ${String(parts.pageCount)}`,
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
  renderNode: PaginatorNode<TMessage>,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const onAction = renderNode.props.toActionMessage;
  if (onAction === undefined || bounds.height <= 0) return [];
  return paginatorLayout(renderNode, widthProfile).controls.flatMap((control): readonly HitTarget<TMessage>[] => control.disabled
    ? []
    : [{
        id: paginatorControlTargetId(renderNode, control.action.kind),
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

function paginatorLayout(renderNode: PaginatorNode, widthProfile: TextWidthProfile): PaginatorLayout {
  const parts = paginatorParts(renderNode);
  const spans: RenderSpan[] = [];
  const controls: PaginatorControl[] = [];
  let offset = 0;
  const append = (
    text: string,
    label: string,
    style = resolveRenderNodeStyle(renderNode, { part: 'label' }),
    state?: import('../../element/metadata.ts').ElementVisualState
  ): void => {
    spans.push(dataSpan(text, style, dataSource(renderNode, label, state === undefined ? {} : { state })));
    offset += terminalTextWidth(text, { widthProfile });
  };
  const appendControl = (
    text: string,
    label: string,
    action: PaginatorAction,
    disabled: boolean
  ): void => {
    const width = terminalTextWidth(text, { widthProfile });
    controls.push({ label, action, offset, width, disabled });
    const state = interactionVisualState(renderNode, paginatorControlTargetId(renderNode, action.kind), { disabled });
    append(text, `control.${action.kind}`, resolveRenderNodeStyle(renderNode, {
      part: 'control',
      ...(state === undefined ? {} : { state })
    }), state);
  };

  if (parts.label.length > 0) {
    append(parts.label, 'label');
    append(' ', 'label.gap');
  }
  if (renderNode.props.toActionMessage !== undefined) {
    const atFirst = parts.pageNumber <= 1;
    appendControl(' « ', 'First page', { kind: 'first' }, atFirst);
    append(' ', 'control.gap.first');
    appendControl(' ‹ ', 'Previous page', { kind: 'previous' }, atFirst);
    append(' ', 'control.gap.previous');
  }
  append('Page ', 'page.label');
  append(String(parts.pageNumber), 'page.value', resolveRenderNodeStyle(renderNode, { part: 'value' }));
  append(' of ', 'page.separator', resolveRenderNodeStyle(renderNode, { part: 'separator' }));
  append(String(parts.pageCount), 'page.count', resolveRenderNodeStyle(renderNode, { part: 'value' }));
  if (renderNode.props.toActionMessage !== undefined) {
    const atLast = parts.pageNumber >= parts.pageCount;
    append(' ', 'control.gap.next');
    appendControl(' › ', 'Next page', { kind: 'next' }, atLast);
    append(' ', 'control.gap.last');
    appendControl(' » ', 'Last page', { kind: 'last' }, atLast);
  }
  return { spans, controls };
}

function paginatorControlTargetId(renderNode: PaginatorNode, kind: PaginatorAction['kind']): string {
  return renderNodeTargetId(renderNode, kind);
}

function paginatorParts(renderNode: PaginatorNode): PaginatorParts {
  const pageCount = normalizedCount(numberProp(renderNode, 'pageCount') ?? 1);
  return {
    label: stringify(renderNode.props.label),
    pageNumber: Math.max(1, Math.min(pageCount, Math.floor(numberProp(renderNode, 'pageNumber') ?? 1))),
    pageCount
  };
}

function normalizedCount(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}
