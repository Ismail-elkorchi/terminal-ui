import { defineComponent, measureRenderSpans, span } from '../../component/index.ts';
import type { ComponentMessage, SemanticLeafComponentFactory } from '../../component/index.ts';
import type { PaginatorOptions } from '../options/content.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { PaginatorAction } from '../../ui-model/paginator.ts';
import type { PaginatorStylePart } from '../../ui-model/style-parts.ts';
import type { RenderSpan } from '../../visual/render.ts';

interface PaginatorModel {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label: string;
  readonly pointerState?: PointerInteractionState;
}

interface PaginatorControl {
  readonly label: string;
  readonly action: PaginatorAction;
  readonly offset: number;
  readonly width: number;
  readonly disabled: boolean;
}

interface PaginatorVisual {
  readonly spans: readonly RenderSpan[];
  readonly controls: readonly PaginatorControl[];
}

export const paginator: SemanticLeafComponentFactory<
  Pick<PaginatorOptions<ComponentMessage>, 'pageNumber' | 'pageCount' | 'label' | 'pointerState'>,
  PaginatorAction,
  PaginatorStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
> = defineComponent<
  Pick<PaginatorOptions<ComponentMessage>, 'pageNumber' | 'pageCount' | 'label' | 'pointerState'>,
  PaginatorModel,
  PaginatorAction,
  PaginatorStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/paginator',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['focus', 'layer', 'styles'],
  parts: ['control', 'label', 'value', 'separator'],
  prepare(value) {
    const pageNumber = value.pageNumber;
    const pageCount = value.pageCount;
    const label = value.label;
    const pointerState = value.pointerState;
    if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber)) {
      throw new TypeError('paginator pageNumber must be finite.');
    }
    if (typeof pageCount !== 'number' || !Number.isFinite(pageCount)) {
      throw new TypeError('paginator pageCount must be finite.');
    }
    if (label !== undefined && typeof label !== 'string') {
      throw new TypeError('paginator label must be a string.');
    }
    assertPointerState(pointerState, 'paginator');
    const normalizedCount = Math.max(1, Math.floor(pageCount));
    return {
      pageNumber: Math.max(1, Math.min(normalizedCount, Math.floor(pageNumber))),
      pageCount: normalizedCount,
      label: label === undefined ? '' : sanitizeTerminalText(label).text,
      ...(pointerState === undefined ? {} : { pointerState }),
    };
  },
  measure(input) {
    const visual = paginatorVisual(input.model, input.widthProfile, input.id);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: measureRenderSpans(visual.spans, { widthProfile: input.widthProfile }),
      preferredHeight: 1,
    };
  },
  render(input) {
    input.target.write(
      0,
      0,
      paginatorVisual(
        input.model,
        input.widthProfile,
        input.id,
        (text, partName, part, state) => {
          const style = input.style({ part, ...(state === undefined ? {} : { state }) });
          return span(text, {
            ...(style === undefined ? {} : { style }),
            source: input.source({
              partName,
              ...(state === undefined ? {} : { interactionState: state }),
            }),
          });
        },
      ).spans,
    );
  },
  keys() {
    return {
      home: () => ({ kind: 'first' }),
      arrowLeft: () => ({ kind: 'previous' }),
      arrowUp: () => ({ kind: 'previous' }),
      pageUp: () => ({ kind: 'previous' }),
      arrowRight: () => ({ kind: 'next' }),
      arrowDown: () => ({ kind: 'next' }),
      pageDown: () => ({ kind: 'next' }),
      end: () => ({ kind: 'last' }),
    };
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets(input) {
    if (input.bounds.height === 0) return [];
    return paginatorVisual(input.model, input.widthProfile, input.id).controls
      .flatMap((control) =>
        control.disabled ? [] : [{
          id: `${input.id ?? 'paginator'}:${control.action.kind}`,
          bounds: {
            row: 0,
            column: control.offset,
            width: Math.min(control.width, Math.max(0, input.bounds.width - control.offset)),
            height: 1,
          },
          message: () => control.action,
          cursor: 'pointer',
        }]
      );
  },
  accessibility(input) {
    const controls = paginatorVisual(input.model, input.widthProfile, input.id).controls;
    return {
      id: input.id,
      role: 'navigation',
      label: input.model.label || input.id,
      value: `Page ${String(input.model.pageNumber)} of ${String(input.model.pageCount)}`,
      ...(input.focused ? { focused: true } : {}),
      children: controls.map((control) => ({
        id: `${input.id}:${control.action.kind}`,
        role: 'button' as const,
        label: control.label,
        ...(control.disabled ? { disabled: true } : {}),
      })),
    };
  },
});

type PaginatorInteractionState = Exclude<
  import('../../element/metadata.ts').ElementVisualState,
  'default'
>;

function paginatorVisual(
  model: PaginatorModel,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
  id: string | undefined,
  decorate: (
    text: string,
    partName: string,
    part: PaginatorStylePart,
    state: PaginatorInteractionState | undefined,
  ) => RenderSpan = (text) => span(text),
): PaginatorVisual {
  const spans: RenderSpan[] = [];
  const controls: PaginatorControl[] = [];
  let offset = 0;
  const append = (
    text: string,
    partName: string,
    part: PaginatorStylePart,
    state?: PaginatorInteractionState,
  ): void => {
    spans.push(decorate(text, partName, part, state));
    offset += measureRenderSpans([span(text)], { widthProfile });
  };
  const appendControl = (
    text: string,
    label: string,
    action: PaginatorAction,
    disabled: boolean,
  ): void => {
    const width = measureRenderSpans([span(text)], { widthProfile });
    controls.push({ label, action, offset, width, disabled });
    const targetId = `${id ?? 'paginator'}:${action.kind}`;
    const state = disabled ? 'disabled' : pointerVisualState(model.pointerState, targetId);
    append(text, `control.${action.kind}`, 'control', state);
  };
  if (model.label.length > 0) {
    append(model.label, 'label', 'label');
    append(' ', 'label.gap', 'label');
  }
  const atFirst = model.pageNumber <= 1;
  appendControl(' « ', 'First page', { kind: 'first' }, atFirst);
  append(' ', 'control.gap.first', 'control');
  appendControl(' ‹ ', 'Previous page', { kind: 'previous' }, atFirst);
  append(' ', 'control.gap.previous', 'control');
  append('Page ', 'page.label', 'label');
  append(String(model.pageNumber), 'page.value', 'value');
  append(' of ', 'page.separator', 'separator');
  append(String(model.pageCount), 'page.count', 'value');
  const atLast = model.pageNumber >= model.pageCount;
  append(' ', 'control.gap.next', 'control');
  appendControl(' › ', 'Next page', { kind: 'next' }, atLast);
  append(' ', 'control.gap.last', 'control');
  appendControl(' » ', 'Last page', { kind: 'last' }, atLast);
  return { spans, controls };
}

function assertPointerState(
  value: PointerInteractionState | undefined,
  owner: string,
): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} pointerState must be an object.`);
  for (const field of ['hoveredTargetId', 'pressedTargetId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`${owner} pointerState.${field} must be a string.`);
    }
  }
}
