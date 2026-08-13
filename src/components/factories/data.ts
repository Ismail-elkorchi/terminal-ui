import { defineComponent, measureRenderSpans, span } from '../../component/index.ts';
import type { ComponentMessage, SemanticLeafComponentFactory } from '../../component/index.ts';
import type { PaginationOptions } from '../options/content.ts';
import { pointerVisualState } from '../../interaction/index.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import { preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { PaginationAction } from '../../ui-model/pagination.ts';
import type { PaginationStylePart } from '../../ui-model/style-parts.ts';
import type { RenderSpan } from '../../visual/render.ts';

interface PaginationModel {
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label: string;
  readonly pointerState?: PointerInteractionState;
}

interface PaginationControl {
  readonly label: string;
  readonly action: PaginationAction;
  readonly offset: number;
  readonly width: number;
  readonly disabled: boolean;
}

interface PaginationVisual {
  readonly spans: readonly RenderSpan[];
  readonly controls: readonly PaginationControl[];
}

export const pagination: SemanticLeafComponentFactory<
  Pick<PaginationOptions<ComponentMessage>, 'pageNumber' | 'pageCount' | 'label' | 'pointerState'>,
  PaginationAction,
  PaginationStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
> = defineComponent<
  Pick<PaginationOptions<ComponentMessage>, 'pageNumber' | 'pageCount' | 'label' | 'pointerState'>,
  PaginationModel,
  PaginationAction,
  PaginationStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/pagination',
  optionFields: { pageNumber: true, pageCount: true, label: true, pointerState: true } as const,
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'navigation',
  metadata: ['focus', 'layer', 'styles'],
  parts: ['control', 'label', 'value', 'separator'],
  prepare(value) {
    const pageNumber = value.pageNumber;
    const pageCount = value.pageCount;
    const label = value.label;
    const pointerState = preparePointerInteractionState(
      value.pointerState,
      'pagination pointerState',
    );
    if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber)) {
      throw new TypeError('pagination pageNumber must be finite.');
    }
    if (typeof pageCount !== 'number' || !Number.isFinite(pageCount)) {
      throw new TypeError('pagination pageCount must be finite.');
    }
    if (label !== undefined && typeof label !== 'string') {
      throw new TypeError('pagination label must be a string.');
    }
    const normalizedCount = Math.max(1, Math.floor(pageCount));
    return {
      pageNumber: Math.max(1, Math.min(normalizedCount, Math.floor(pageNumber))),
      pageCount: normalizedCount,
      label: label === undefined ? '' : sanitizeTerminalText(label).text,
      ...(pointerState === undefined ? {} : { pointerState }),
    };
  },
  measure(input) {
    const visual = paginationVisual(input.model, input.widthProfile, input.id);
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
      paginationVisual(
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
    return paginationVisual(input.model, input.widthProfile, input.id).controls
      .flatMap((control) =>
        control.disabled ? [] : [{
          id: `${input.id ?? 'pagination'}:${control.action.kind}`,
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
    const controls = paginationVisual(input.model, input.widthProfile, input.id).controls;
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

type PaginationInteractionState = Exclude<
  import('../../element/metadata.ts').ElementVisualState,
  'default'
>;

function paginationVisual(
  model: PaginationModel,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
  id: string | undefined,
  decorate: (
    text: string,
    partName: string,
    part: PaginationStylePart,
    state: PaginationInteractionState | undefined,
  ) => RenderSpan = (text) => span(text),
): PaginationVisual {
  const spans: RenderSpan[] = [];
  const controls: PaginationControl[] = [];
  let offset = 0;
  const append = (
    text: string,
    partName: string,
    part: PaginationStylePart,
    state?: PaginationInteractionState,
  ): void => {
    spans.push(decorate(text, partName, part, state));
    offset += measureRenderSpans([span(text)], { widthProfile });
  };
  const appendControl = (
    text: string,
    label: string,
    action: PaginationAction,
    disabled: boolean,
  ): void => {
    const width = measureRenderSpans([span(text)], { widthProfile });
    controls.push({ label, action, offset, width, disabled });
    const targetId = `${id ?? 'pagination'}:${action.kind}`;
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
