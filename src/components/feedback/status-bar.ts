import { assertStableIds } from '../../collection/identity.ts';
import type { SemanticLeafComponentFactory } from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import { isNonArrayObject, isStringMember } from '../../foundation/validation.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderSpans, measureRenderSpans, span } from '../../visual/render-content.ts';
import { sanitizeLine, singleLineMeasurement } from '../shared/indicator-helpers.ts';
import { isStatusBarStatus } from '../status.ts';
import type { StatusBarStylePart } from '../style-parts.ts';
import type { StatusBarOptions } from './options.ts';
import type { StatusBarItem, StatusBarSection } from './status-bar-contracts.ts';
import type { StatusVisualInput } from './status-paint.ts';
import { fillSpans, statusGap, statusInlineSpans, statusSpan } from './status-paint.ts';

interface StatusBarModel {
  readonly leading: readonly StatusBarItem[];
  readonly center: readonly StatusBarItem[];
  readonly trailing: readonly StatusBarItem[];
}

export const statusBar: SemanticLeafComponentFactory<
  Pick<StatusBarOptions, 'leading' | 'center' | 'trailing'>,
  never,
  StatusBarStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
> = defineComponent<Pick<StatusBarOptions, 'leading' | 'center' | 'trailing'>>()({
  name: 'terminal-ui/components/status-bar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'leading', 'value', 'trailing'],
  createModel(value) {
    const leading = decodeStatusItems(value.leading, 'leading');
    const center = decodeStatusItems(value.center, 'center');
    const trailing = decodeStatusItems(value.trailing, 'trailing');
    assertStableIds([...leading, ...center, ...trailing], (item) => item.id, 'statusBar');
    return { leading, center, trailing };
  },
  measure(input) {
    const spans = statusBarMeasureSpans(input.model, input.theme);
    return singleLineMeasurement(spans, input.widthProfile);
  },
  render(input) {
    const [leading, center, trailing] = statusBarSections(input);
    input.target.write(
      0,
      0,
      placedStatusBarSections(input, leading, center, trailing, input.bounds.width),
    );
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'status',
      value: [model.leading, model.center, model.trailing]
        .flatMap((section) => section.map(statusItemAccessibleText))
        .join('  '),
      live: 'polite',
    };
  },
});

function decodeStatusItems(
  value: readonly StatusBarItem[] | undefined,
  section: StatusBarSection,
): readonly StatusBarItem[] {
  if (value === undefined) return [];
  return value.map((candidate, index) =>
    decodeStatusItem(candidate, `${section}[${String(index)}]`)
  );
}

function decodeStatusItem(value: StatusBarItem, path: string): StatusBarItem {
  if (!isNonArrayObject(value)) throw new TypeError(`statusBar ${path} must be an object.`);
  const { kind, id, leading, trailing } = value;
  const textValue = value.text;
  if (!isStringMember(kind, ['text', 'status'])) {
    throw new TypeError(`statusBar ${path} kind is invalid.`);
  }
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError(`statusBar ${path} id must be a non-empty string.`);
  }
  if (typeof textValue !== 'string') {
    throw new TypeError(`statusBar ${path} text must be a string.`);
  }
  const common = {
    id: sanitizeLine(id),
    text: sanitizeLine(textValue),
    ...(leading === undefined ? {} : { leading: normalizeInlineContent(leading) }),
    ...(trailing === undefined ? {} : { trailing: normalizeInlineContent(trailing) }),
  };
  if (kind === 'text') return { ...common, kind };
  const status = value.status;
  if (!isStatusBarStatus(status)) throw new TypeError(`statusBar ${path} status is invalid.`);
  return { ...common, kind, status };
}

export type StatusBarVisualInput = StatusVisualInput<StatusBarModel, StatusBarStylePart>;

function statusBarSections(
  input: StatusBarVisualInput,
): readonly [
  readonly RenderSpan[],
  readonly RenderSpan[],
  readonly RenderSpan[],
] {
  return [
    statusBarSectionSpans(input, 'leading', input.model.leading),
    statusBarSectionSpans(input, 'center', input.model.center),
    statusBarSectionSpans(input, 'trailing', input.model.trailing),
  ];
}

function statusBarMeasureSpans(
  model: StatusBarModel,
  theme: import('../../theme/index.ts').TerminalTheme,
): readonly RenderSpan[] {
  const sections = (['leading', 'center', 'trailing'] as const).map((section) =>
    model[section].flatMap((item, index): readonly RenderSpan[] => {
      const parts = [
        ...(item.leading === undefined
          ? []
          : item.leading.map((segment) =>
            span(inlineSegmentText(segment, theme.tokens.symbols.mode))
          )),
        ...(item.leading === undefined ? [] : [span(' ')]),
        ...(item.kind === 'status' ? [span(statusBarMarker(item.status, theme)), span(' ')] : []),
        span(item.text),
        ...(item.trailing === undefined ? [] : [span(' ')]),
        ...(item.trailing === undefined
          ? []
          : item.trailing.map((segment) =>
            span(inlineSegmentText(segment, theme.tokens.symbols.mode))
          )),
      ];
      return index === 0 ? parts : [span('  '), ...parts];
    })
  );
  return sections.filter((section) => section.length > 0).flatMap((section, index) =>
    index === 0 ? section : [span('  '), ...section]
  );
}

function statusBarSectionSpans(
  input: StatusBarVisualInput,
  section: StatusBarSection,
  items: readonly StatusBarItem[],
): readonly RenderSpan[] {
  return items.flatMap((item, index): readonly RenderSpan[] => {
    const prefix = `${section}.${item.id}`;
    const leading = statusInlineSpans(input, item.leading, `${prefix}.leading`, 'leading', item.id);
    const trailing = statusInlineSpans(
      input,
      item.trailing,
      `${prefix}.trailing`,
      'trailing',
      item.id,
    );
    const value = item.kind === 'status'
      ? [
        statusSpan(input, statusBarMarker(item.status, input.theme), 'marker', `${prefix}.marker`, {
          itemId: item.id,
          cellRole: 'decoration',
          base: statusBarToneStyle(item.status),
        }),
        statusSpan(input, ' ', 'marker', `${prefix}.gap`, {
          itemId: item.id,
          cellRole: 'separator',
        }),
        statusSpan(input, item.text, 'value', `${prefix}.value`, {
          itemId: item.id,
          base: statusBarToneStyle(item.status),
        }),
      ]
      : [statusSpan(input, item.text, 'value', `${prefix}.value`, { itemId: item.id })];
    const content = [
      ...leading,
      ...(leading.length === 0 ? [] : [statusGap(input, `${prefix}.leading.separator`)]),
      ...value,
      ...(trailing.length === 0 ? [] : [statusGap(input, `${prefix}.trailing.separator`)]),
      ...trailing,
    ];
    return index === 0
      ? content
      : [statusGap(input, `${section}.separator.${String(index)}`), ...content];
  });
}

function placedStatusBarSections(
  input: StatusBarVisualInput,
  leadingInput: readonly RenderSpan[],
  centerInput: readonly RenderSpan[],
  trailingInput: readonly RenderSpan[],
  maxCells: number,
): readonly RenderSpan[] {
  if (maxCells <= 0) return [];
  const options = { ellipsis: '…', widthProfile: input.widthProfile } as const;
  const trailing = clipRenderSpans(trailingInput, maxCells, { ...options, mode: 'middle' });
  const trailingWidth = measureRenderSpans(trailing, { widthProfile: input.widthProfile });
  const leadingBudget = Math.max(0, maxCells - trailingWidth - (trailingWidth > 0 ? 2 : 0));
  const leading = clipRenderSpans(leadingInput, leadingBudget, options);
  const leadingWidth = measureRenderSpans(leading, { widthProfile: input.widthProfile });
  const trailingStart = maxCells - trailingWidth;
  const center = clipRenderSpans(centerInput, maxCells, { ...options, mode: 'middle' });
  const centerWidth = measureRenderSpans(center, { widthProfile: input.widthProfile });
  const desiredCenterStart = Math.floor((maxCells - centerWidth) / 2);
  const centerFits = centerWidth > 0 &&
    desiredCenterStart >= leadingWidth + (leadingWidth > 0 ? 1 : 0) &&
    desiredCenterStart + centerWidth <= trailingStart - (trailingWidth > 0 ? 1 : 0);
  const placements = [
    ...(leading.length === 0 ? [] : [{ start: 0, spans: leading }]),
    ...(centerFits ? [{ start: desiredCenterStart, spans: center }] : []),
    ...(trailing.length === 0 ? [] : [{ start: trailingStart, spans: trailing }]),
  ].sort((left, right) => left.start - right.start);
  const output: RenderSpan[] = [];
  let column = 0;
  for (const placement of placements) {
    if (placement.start > column) output.push(...fillSpans(input, placement.start - column));
    output.push(...placement.spans);
    column = placement.start +
      measureRenderSpans(placement.spans, { widthProfile: input.widthProfile });
  }
  if (column < maxCells) output.push(...fillSpans(input, maxCells - column));
  return output;
}

function statusItemAccessibleText(item: StatusBarItem): string {
  return [
    item.leading === undefined ? '' : inlineContentAccessibleText(item.leading),
    item.text,
    item.trailing === undefined ? '' : inlineContentAccessibleText(item.trailing),
  ].filter((part) => part.length > 0).join(' ');
}

function statusBarMarker(
  status: import('./status-bar-contracts.ts').StatusBarStatus,
  theme: import('../../theme/index.ts').TerminalTheme,
): string {
  switch (status) {
    case 'running':
    case 'info':
      return theme.tokens.symbols.statusInfo;
    case 'success':
      return theme.tokens.symbols.statusSuccess;
    case 'warning':
      return theme.tokens.symbols.statusWarning;
    case 'error':
      return theme.tokens.symbols.statusError;
    case 'pending':
    case 'idle':
      return theme.tokens.symbols.progressEmpty;
  }
}

function statusBarToneStyle(
  status: import('./status-bar-contracts.ts').StatusBarStatus,
): TerminalStyle {
  const token = status === 'running'
    ? 'status.running'
    : status === 'success'
    ? 'status.success'
    : status === 'warning'
    ? 'status.warning'
    : status === 'error'
    ? 'status.error'
    : status === 'info'
    ? 'status.info'
    : 'status.pending';
  return { fg: { kind: 'theme', token }, bold: status === 'error' || status === 'success' };
}
