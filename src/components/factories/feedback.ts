import {
  clipRenderSpans,
  defineComponent,
  measureRenderSpans,
  span,
} from '../../component/index.ts';
import type { SemanticLeafComponentFactory } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type {
  HelpBarOptions,
  ActivityIndicatorOptions,
  MeterOptions,
  ProgressBarOptions,
  SparklineOptions,
  RunningActivityIndicatorOptions,
  SettledActivityIndicatorOptions,
  StatusBarOptions,
} from '../options/feedback.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type {
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
  StatusBarItem,
  ValueScale,
  ValueScaleStop,
} from '../../ui-model/feedback.ts';
import type { ProcessStatus } from '../../ui-model/contracts.ts';
import type {
  ActivityIndicatorStylePart,
  HelpBarStylePart,
  MeterStylePart,
  ProgressBarStylePart,
  SparklineStylePart,
  StatusBarStylePart,
} from '../../ui-model/style-parts.ts';
import type { StatusBarSection } from '../../ui-model/feedback.ts';
import type { HelpGroup } from '../../ui-model/contracts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { ComponentRenderInput } from '../../component/index.ts';
import { assertStableIds } from '../../ui-model/identity.ts';
import { isProcessStatus, isStatusBarStatus } from '../../ui-model/status.ts';
import {
  fillTextCells,
  measureTextCells,
  oneCellGlyph,
  sanitizeTerminalText,
} from '../../text/index.ts';
import { indeterminateProgressFrame } from '../../behavior/feedback.ts';
import { formatKeyboardBinding } from '../../interaction/key-binding.ts';
import { decodeInputTrigger } from '../../input/index.ts';
import {
  assertFiniteNumber,
  assertOptionalEnum,
  assertOptionalFiniteNumber,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import { isThemeColorToken } from '../../visual/color.ts';

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
> = defineComponent<
  Pick<StatusBarOptions, 'leading' | 'center' | 'trailing'>,
  StatusBarModel,
  never,
  StatusVisualPart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/status-bar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'leading', 'value', 'trailing'],
  prepare(value) {
    const leading = prepareStatusItems(value.leading, 'leading');
    const center = prepareStatusItems(value.center, 'center');
    const trailing = prepareStatusItems(value.trailing, 'trailing');
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

function prepareStatusItems(
  value: readonly StatusBarItem[] | undefined,
  section: StatusBarSection,
): readonly StatusBarItem[] {
  if (value === undefined) return [];
  return value.map((candidate, index) =>
    prepareStatusItem(candidate, `${section}[${String(index)}]`)
  );
}

function prepareStatusItem(value: StatusBarItem, path: string): StatusBarItem {
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

interface HelpBarModel {
  readonly groups: readonly PreparedHelpGroup[];
}

interface PreparedHelpGroup {
  readonly id: string;
  readonly label?: string;
  readonly bindings: readonly { readonly key: string; readonly label: string }[];
}

export const helpBar: SemanticLeafComponentFactory<
  Pick<HelpBarOptions, 'groups'>,
  never,
  HelpBarStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<HelpBarOptions, 'groups'>,
  HelpBarModel,
  never,
  StatusVisualPart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/help-bar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'group',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value'],
  prepare(value) {
    const groups = value.groups.map((group, index) => prepareHelpGroup(group, index));
    assertStableIds(groups, (group) => group.id, 'helpBar');
    return { groups };
  },
  measure(input) {
    return singleLineMeasurement(helpBarMeasureSpans(input.model), input.widthProfile);
  },
  render(input) {
    const spans = fitHelpBarSpans(input, input.bounds.width);
    input.target.write(0, 0, [
      ...spans,
      ...fillSpans(
        input,
        Math.max(
          0,
          input.bounds.width - measureRenderSpans(spans, {
            widthProfile: input.widthProfile,
          }),
        ),
      ),
    ]);
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'group',
      label: 'Keyboard shortcuts',
      children: model.groups.map((group) => ({
        id: `${id}:${group.id}`,
        role: 'group' as const,
        ...(group.label === undefined ? {} : { label: group.label }),
        children: group.bindings.map((binding, index) => ({
          id: `${id}:${group.id}:${String(index)}`,
          role: 'text' as const,
          label: binding.key,
          value: binding.label,
        })),
      })),
    };
  },
});

type StatusVisualPart = StatusBarStylePart | HelpBarStylePart;

type StatusVisualInput = Pick<
  ComponentRenderInput<StatusBarModel | HelpBarModel, StatusVisualPart>,
  'id' | 'model' | 'theme' | 'widthProfile' | 'style' | 'source'
>;

function singleLineMeasurement(
  spans: readonly RenderSpan[],
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): import('../../renderer/index.ts').Measurement {
  return {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: measureRenderSpans(spans, { widthProfile }),
    preferredHeight: 1,
  };
}

function statusBarSections(
  input: StatusVisualInput & { readonly model: StatusBarModel },
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
  input: StatusVisualInput,
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

function statusInlineSpans(
  input: StatusVisualInput,
  content: InlineContent | undefined,
  partName: string,
  part: 'leading' | 'trailing',
  itemId: string,
): readonly RenderSpan[] {
  if (content === undefined) return [];
  return content.map((segment, index) => {
    const style = input.style({
      part,
      ...(segment.style === undefined ? {} : { base: segment.style }),
    });
    return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source: input.source({
        cellRole: 'text',
        partName: `${partName}.${String(index)}`,
        partType: part,
        itemId,
      }),
    });
  });
}

function placedStatusBarSections(
  input: StatusVisualInput,
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

function statusGap(input: StatusVisualInput, partName: string): RenderSpan {
  return statusSpan(input, '  ', 'marker', partName, { cellRole: 'separator' });
}

function fillSpans(input: StatusVisualInput, cells: number): readonly RenderSpan[] {
  return cells <= 0 ? [] : [statusSpan(input, ' '.repeat(cells), 'value', 'fill', {
    cellRole: 'decoration',
    base: { bg: { kind: 'theme', token: 'surface.bar.background' } },
  })];
}

function statusSpan(
  input: StatusVisualInput,
  textValue: string,
  part: StatusVisualPart,
  partName: string,
  options: {
    readonly itemId?: string;
    readonly cellRole?: import('../../visual/source.ts').FrameCellRole;
    readonly base?: TerminalStyle;
  } = {},
): RenderSpan {
  const barBase: TerminalStyle = {
    bg: { kind: 'theme', token: 'surface.bar.background' },
    ...options.base,
  };
  const style = input.style({ part, base: barBase });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.source({
      cellRole: options.cellRole ?? 'text',
      partName,
      partType: 'status',
      ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
    }),
  });
}

function statusItemAccessibleText(item: StatusBarItem): string {
  return [
    item.leading === undefined ? '' : inlineContentAccessibleText(item.leading),
    item.text,
    item.trailing === undefined ? '' : inlineContentAccessibleText(item.trailing),
  ].filter((part) => part.length > 0).join(' ');
}

function prepareHelpGroup(value: HelpGroup, index: number): PreparedHelpGroup {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`helpBar groups[${String(index)}] must be an object.`);
  }
  const id = value.id;
  const label = value.label;
  const bindings = value.bindings;
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError(`helpBar groups[${String(index)}] id must be a non-empty string.`);
  }
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError(`helpBar groups[${String(index)}] label must be a string.`);
  }
  if (!Array.isArray(bindings)) {
    throw new TypeError(`helpBar groups[${String(index)}] bindings must be an array.`);
  }
  return {
    id: sanitizeLine(id),
    ...(label === undefined ? {} : { label: sanitizeLine(label) }),
    bindings: bindings.map((binding, bindingIndex) => {
      if (
        !isNonArrayObject(binding) ||
        typeof binding['label'] !== 'string'
      ) {
        throw new TypeError(
          `helpBar groups[${String(index)}].bindings[${
            String(bindingIndex)
          }] must contain a typed binding and string label.`,
        );
      }
      const trigger = decodeInputTrigger(binding['binding']);
      if (trigger.kind === 'text' || trigger.kind === 'focus') {
        throw new TypeError('helpBar bindings must use key, codePoint, or physicalKey triggers.');
      }
      return {
        key: formatKeyboardBinding(trigger),
        label: sanitizeLine(binding['label']),
      };
    }),
  };
}

function helpBarSpans(
  input: StatusVisualInput & { readonly model: HelpBarModel },
): readonly RenderSpan[] {
  return input.model.groups.flatMap((group, groupIndex): readonly RenderSpan[] => [
    ...(groupIndex === 0 ? [] : [statusGap(input, `group.${group.id}.separator`)]),
    ...(group.label === undefined ? [] : [
      statusSpan(input, group.label, 'label', `group.${group.id}.label`, { itemId: group.id }),
      statusSpan(input, ' ', 'marker', `group.${group.id}.gap`, { cellRole: 'separator' }),
    ]),
    ...group.bindings.flatMap((binding, bindingIndex): readonly RenderSpan[] => [
      ...(group.label === undefined && bindingIndex === 0 ? [] : [
        statusGap(input, `group.${group.id}.binding.${String(bindingIndex)}.separator`),
      ]),
      statusSpan(
        input,
        binding.key,
        'label',
        `group.${group.id}.binding.${String(bindingIndex)}.key`,
        {
          itemId: group.id,
          base: {
            fg: { kind: 'theme', token: 'keyHint.foreground' },
            bg: { kind: 'theme', token: 'keyHint.background' },
            bold: true,
          },
        },
      ),
      statusSpan(
        input,
        ` ${binding.label}`,
        'value',
        `group.${group.id}.binding.${String(bindingIndex)}.label`,
        {
          itemId: group.id,
        },
      ),
    ]),
  ]);
}

function helpBarMeasureSpans(
  model: HelpBarModel,
): readonly RenderSpan[] {
  return model.groups.flatMap((group, groupIndex): readonly RenderSpan[] => [
    ...(groupIndex === 0 ? [] : [span('  ')]),
    ...(group.label === undefined ? [] : [span(group.label), span(' ')]),
    ...group.bindings.flatMap((binding, bindingIndex): readonly RenderSpan[] => [
      ...(group.label === undefined && bindingIndex === 0 ? [] : [span('  ')]),
      span(binding.key),
      span(` ${binding.label}`),
    ]),
  ]);
}

function fitHelpBarSpans(
  input: StatusVisualInput & { readonly model: HelpBarModel },
  maxCells: number,
): readonly RenderSpan[] {
  if (maxCells <= 0) return [];
  const spans = helpBarSpans(input);
  if (measureRenderSpans(spans, { widthProfile: input.widthProfile }) <= maxCells) return spans;
  const marker = statusSpan(input, '…', 'marker', 'overflow', { cellRole: 'decoration' });
  const markerWidth = measureRenderSpans([marker], { widthProfile: input.widthProfile });
  const fitted: RenderSpan[] = [];
  for (const group of input.model.groups) {
    const groupPrefix = [
      ...(fitted.length === 0 ? [] : [statusGap(input, `group.${group.id}.separator`)]),
      ...(group.label === undefined ? [] : [
        statusSpan(input, group.label, 'label', `group.${group.id}.label`, { itemId: group.id }),
        statusSpan(input, ' ', 'marker', `group.${group.id}.gap`, { cellRole: 'separator' }),
      ]),
    ];
    if (
      measureRenderSpans([...fitted, ...groupPrefix, marker], {
        widthProfile: input.widthProfile,
      }) <= maxCells
    ) {
      fitted.push(...groupPrefix);
    }
    for (let bindingIndex = 0; bindingIndex < group.bindings.length; bindingIndex += 1) {
      const binding = group.bindings[bindingIndex];
      if (binding === undefined) continue;
      const bindingSpans = [
        ...(group.label === undefined && bindingIndex === 0 ? [] : [
          statusGap(input, `group.${group.id}.binding.${String(bindingIndex)}.separator`),
        ]),
        statusSpan(
          input,
          binding.key,
          'label',
          `group.${group.id}.binding.${String(bindingIndex)}.key`,
          {
            itemId: group.id,
            base: {
              fg: { kind: 'theme', token: 'keyHint.foreground' },
              bg: { kind: 'theme', token: 'keyHint.background' },
              bold: true,
            },
          },
        ),
        statusSpan(
          input,
          ` ${binding.label}`,
          'value',
          `group.${group.id}.binding.${String(bindingIndex)}.label`,
          {
            itemId: group.id,
          },
        ),
      ];
      if (
        measureRenderSpans([...fitted, ...bindingSpans, marker], {
          widthProfile: input.widthProfile,
        }) > maxCells
      ) {
        const separator = fitted.length === 0 ? [] : [statusGap(input, 'overflow.separator')];
        return measureRenderSpans([...fitted, ...separator, marker], {
            widthProfile: input.widthProfile,
          }) <= maxCells
          ? [...fitted, ...separator, marker]
          : fitted.length === 0 && markerWidth <= maxCells
          ? [marker]
          : fitted;
      }
      fitted.push(...bindingSpans);
    }
  }
  return fitted;
}

function statusBarMarker(
  status: import('../../ui-model/contracts.ts').StatusBarStatus,
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
  status: import('../../ui-model/contracts.ts').StatusBarStatus,
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

interface ActivityIndicatorModel {
  readonly label: string;
  readonly status: ProcessStatus;
  readonly frames?: readonly string[];
  readonly frameIndex: number;
}

type ActivityIndicatorOwnOptions =
  | Pick<RunningActivityIndicatorOptions, 'label' | 'status' | 'frames' | 'frameIndex'>
  | Pick<SettledActivityIndicatorOptions, 'label' | 'status' | 'frames' | 'frameIndex'>;

type ActivityIndicatorFactory = (options: ActivityIndicatorOptions) => Element;

export const activityIndicator: ActivityIndicatorFactory = defineComponent<
  ActivityIndicatorOwnOptions,
  ActivityIndicatorModel,
  never,
  ActivityIndicatorStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/activity-indicator',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value'],
  prepare(value) {
    const label = value.label;
    const status = value.status;
    const frames = value.frames;
    const frameIndex = value.frameIndex;
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new TypeError('activityIndicator requires a non-empty label.');
    }
    if (!isProcessStatus(status)) {
      throw new TypeError(
        'activityIndicator status must be idle, running, success, warning, or error.',
      );
    }
    if (status !== 'running' && (frames !== undefined || frameIndex !== undefined)) {
      throw new TypeError('activityIndicator frames are only valid while running.');
    }
    if (frames !== undefined && !isStringArray(frames)) {
      throw new TypeError('activityIndicator frames must be strings.');
    }
    if (
      frameIndex !== undefined && (typeof frameIndex !== 'number' || !Number.isFinite(frameIndex))
    ) {
      throw new TypeError('activityIndicator frameIndex must be finite.');
    }
    const preparedFrames = frames === undefined ? undefined : frames
      .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
      .filter((frame) => frame.length > 0);
    return {
      label: sanitizeTerminalText(label).text,
      status,
      ...(preparedFrames === undefined || preparedFrames.length === 0
        ? {}
        : { frames: preparedFrames }),
      frameIndex: frameIndex === undefined ? 0 : Math.floor(frameIndex),
    };
  },
  measure(input) {
    const spans = activityIndicatorSpans(input);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: measureRenderSpans(spans, { widthProfile: input.widthProfile }),
      preferredHeight: 1,
    };
  },
  render(input) {
    input.target.write(0, 0, activityIndicatorSpans(input, true));
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'status',
      value: `${model.label} (${model.status})`,
      live: 'polite',
    };
  },
});

function activityIndicatorSpans(
  input: {
    readonly model: ActivityIndicatorModel;
    readonly theme: import('../../theme/index.ts').TerminalTheme;
    readonly style?: (
      input: import('../../component/index.ts').ComponentStyleInput<ActivityIndicatorStylePart>,
    ) => import('../../visual/render.ts').TerminalStyle | undefined;
    readonly source?: (
      input?: import('../../component/index.ts').ComponentSourceInput,
    ) => import('../../visual/source.ts').FrameCellSource;
  },
  decorated = false,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const marker = activityMarker(input.model, input.theme);
  if (!decorated || input.style === undefined || input.source === undefined) {
    return [
      span(marker),
      span(' '),
      span(input.model.label),
      ...(input.model.status === 'idle' || input.model.status === 'running'
        ? []
        : [span(' ('), span(input.model.status), span(')')]),
    ];
  }
  const markerStyle = input.style({ part: 'marker', base: processStatusStyle(input.model.status) });
  const labelStyle = input.style({
    part: 'label',
    base: { fg: { kind: 'theme', token: 'text.default' } },
  });
  const statusValueStyle = input.style({
    part: 'value',
    base: processStatusStyle(input.model.status),
  });
  const suffix = input.model.status === 'idle' || input.model.status === 'running' ? [] : [
    span(' (', { source: input.source({ partName: 'status.open', cellRole: 'decoration' }) }),
    span(input.model.status, {
      ...(statusValueStyle === undefined ? {} : { style: statusValueStyle }),
      source: input.source({ partName: 'status.value', cellRole: 'text' }),
    }),
    span(')', { source: input.source({ partName: 'status.close', cellRole: 'decoration' }) }),
  ];
  return [
    span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.source({ partName: 'status.marker', cellRole: 'decoration' }),
    }),
    span(' ', { source: input.source({ partName: 'status.gap', cellRole: 'separator' }) }),
    span(input.model.label, {
      ...(labelStyle === undefined ? {} : { style: labelStyle }),
      source: input.source({ partName: 'label', cellRole: 'text' }),
    }),
    ...suffix,
  ];
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function activityMarker(
  model: ActivityIndicatorModel,
  theme: import('../../theme/index.ts').TerminalTheme,
): string {
  if (model.status !== 'running') return processStatusMarker(model.status, theme);
  const frames = model.frames ?? theme.tokens.symbols.spinnerFrames;
  const index = ((model.frameIndex % frames.length) + frames.length) % frames.length;
  return frames[index] ?? theme.tokens.symbols.statusInfo;
}

function processStatusMarker(
  status: ProcessStatus,
  theme: import('../../theme/index.ts').TerminalTheme,
): string {
  switch (status) {
    case 'running':
      return theme.tokens.symbols.statusInfo;
    case 'success':
      return theme.tokens.symbols.statusSuccess;
    case 'warning':
      return theme.tokens.symbols.statusWarning;
    case 'error':
      return theme.tokens.symbols.statusError;
    case 'idle':
      return theme.tokens.symbols.progressEmpty;
  }
}

function processStatusStyle(status: ProcessStatus): import('../../visual/render.ts').TerminalStyle {
  const token = status === 'running'
    ? 'status.running'
    : status === 'success'
    ? 'status.success'
    : status === 'warning'
    ? 'status.warning'
    : status === 'error'
    ? 'status.error'
    : 'status.pending';
  return {
    fg: { kind: 'theme', token },
    bold: status === 'error' || status === 'success',
  };
}

interface ProgressBarModel {
  readonly label: string;
  readonly display: ProgressBarDisplay;
  readonly labelPosition: ProgressBarLabelPosition;
  readonly status: ProcessStatus;
  readonly indeterminate: boolean;
  readonly value: number;
  readonly max: number;
  readonly barWidth: number;
  readonly percentage: number;
  readonly frame: number;
  readonly valueScale: readonly ValueScaleStop[];
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
}

interface ProgressParts {
  readonly showLabel: boolean;
  readonly showValue: boolean;
  readonly showPercentage: boolean;
  readonly showTiming: boolean;
}

export const progressBar: SemanticLeafComponentFactory<
  Pick<
    ProgressBarOptions,
    | 'label'
    | 'mode'
    | 'barWidth'
    | 'display'
    | 'labelPosition'
    | 'elapsedMs'
    | 'remainingMs'
    | 'status'
    | 'valueScale'
  >,
  never,
  ProgressBarStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<
    ProgressBarOptions,
    | 'label'
    | 'mode'
    | 'barWidth'
    | 'display'
    | 'labelPosition'
    | 'elapsedMs'
    | 'remainingMs'
    | 'status'
    | 'valueScale'
  >,
  ProgressBarModel,
  never,
  ProgressBarStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/progress-bar',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'progressbar',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value', 'track', 'fill'],
  prepare(value) {
    const label = value.label;
    const mode = value.mode;
    const display = value.display;
    const labelPosition = value.labelPosition;
    const status = value.status;
    assertAccessibleLabel(label, 'progressBar');
    assertProcessStatus(status, 'progressBar');
    assertOptionalEnum(
      display,
      ['bar', 'bar+percent', 'bar+value', 'bar+value+percent'],
      'progressBar display',
    );
    assertOptionalEnum(labelPosition, ['start', 'end', 'none'], 'progressBar labelPosition');
    const barWidth = normalizedProgressBarWidth(value.barWidth) ?? 10;
    const elapsedMs = normalizedDuration(value.elapsedMs, 'progressBar elapsedMs');
    const remainingMs = normalizedDuration(value.remainingMs, 'progressBar remainingMs');
    const normalizedMode = prepareProgressMode(mode);
    const max = normalizedMode.kind === 'determinate' ? normalizedMode.max ?? 100 : 100;
    const current = normalizedMode.kind === 'determinate'
      ? Math.max(0, Math.min(max, normalizedMode.value))
      : 0;
    return {
      label: sanitizeLine(label),
      display: display ?? 'bar+value',
      labelPosition: labelPosition ?? 'start',
      status: status ?? 'running',
      indeterminate: normalizedMode.kind === 'indeterminate',
      value: current,
      max,
      barWidth,
      percentage: max === 0 ? 0 : Math.round((current / max) * 100),
      frame: normalizedMode.kind === 'indeterminate' ? Math.floor(normalizedMode.frame ?? 0) : 0,
      valueScale: prepareValueScaleFor(value.valueScale, 'progressBar'),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      ...(remainingMs === undefined ? {} : { remainingMs }),
    };
  },
  measure(input) {
    return singleLineMeasurement(progressSpansFor(input, undefined, false), input.widthProfile);
  },
  render(input) {
    input.target.write(0, 0, progressSpansFor(input, input.bounds.width, true));
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'progressbar',
      ...(model.label === '' ? {} : { label: model.label }),
      numericValue: model.indeterminate
        ? { indeterminate: true }
        : { current: model.value, minimum: 0, maximum: model.max },
      live: 'polite',
      ...progressDescription(model),
    };
  },
});

function prepareProgressMode(mode: ProgressBarMode): ProgressBarMode {
  if (!isNonArrayObject(mode) || !isStringMember(mode.kind, ['determinate', 'indeterminate'])) {
    throw new TypeError('progressBar mode must be determinate or indeterminate.');
  }
  if (mode.kind === 'indeterminate') {
    const frame = mode.frame;
    if (frame !== undefined && (typeof frame !== 'number' || !Number.isFinite(frame))) {
      throw new RangeError('progressBar indeterminate frame must be finite when provided.');
    }
    return { kind: mode.kind, ...(frame === undefined ? {} : { frame }) };
  }
  const { value, max } = mode;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError('progressBar determinate value must be finite.');
  }
  if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max) || max <= 0)) {
    throw new RangeError('progressBar determinate max must be finite and greater than zero.');
  }
  return { kind: mode.kind, value, ...(max === undefined ? {} : { max }) };
}

function normalizedProgressBarWidth(value: number | undefined): number | undefined {
  assertOptionalFiniteNumber(value, 'progressBar barWidth');
  if (value === undefined) return undefined;
  if (value <= 0) throw new RangeError('progressBar barWidth must be greater than zero.');
  return Math.max(1, Math.min(120, Math.floor(value)));
}

function normalizedDuration(value: number | undefined, label: string): number | undefined {
  assertOptionalFiniteNumber(value, label);
  if (value === undefined) return undefined;
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return Math.floor(value);
}

interface ProgressVisualInput {
  readonly model: ProgressBarModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
  readonly style?: ComponentRenderInput<ProgressBarModel, ProgressBarStylePart>['style'];
  readonly source?: ComponentRenderInput<ProgressBarModel, ProgressBarStylePart>['source'];
}

function progressSpansFor(
  input: ProgressVisualInput,
  maxCells: number | undefined,
  decorated: boolean,
): readonly RenderSpan[] {
  if (maxCells !== undefined && maxCells <= 0) return [];
  const initial = progressParts(input.model);
  const candidates: readonly ProgressParts[] = [
    initial,
    { ...initial, showLabel: false },
    { ...initial, showLabel: false, showTiming: false },
    { ...initial, showLabel: false, showTiming: false, showValue: false },
    { ...initial, showLabel: false, showTiming: false, showValue: false, showPercentage: false },
  ];
  for (const parts of candidates) {
    const spans = progressSpans(input, parts, maxCells, decorated);
    if (
      maxCells === undefined ||
      measureRenderSpans(spans, { widthProfile: input.widthProfile }) <= maxCells
    ) return spans;
  }
  return progressSpans(input, candidates.at(-1) ?? initial, maxCells, decorated);
}

function progressSpans(
  input: ProgressVisualInput,
  parts: ProgressParts,
  maxCells: number | undefined,
  decorated: boolean,
): readonly RenderSpan[] {
  const barWidth = fittedProgressBarWidth(input, parts, maxCells, decorated);
  return [
    ...progressStatusSpans(input, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'start'
      ? [progressPartSpan(input, `${input.model.label} `, 'label', 'label', decorated)]
      : []),
    ...progressTrackSpans(input, barWidth, decorated),
    ...progressMetricSpans(input, parts, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'end'
      ? [progressPartSpan(input, ` ${input.model.label}`, 'label', 'label', decorated)]
      : []),
  ];
}

function fittedProgressBarWidth(
  input: ProgressVisualInput,
  parts: ProgressParts,
  maxCells: number | undefined,
  decorated: boolean,
): number {
  if (maxCells === undefined) return input.model.barWidth;
  const withoutBar = [
    ...progressStatusSpans(input, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'start'
      ? [progressPartSpan(input, `${input.model.label} `, 'label', 'label', decorated)]
      : []),
    ...progressMetricSpans(input, parts, decorated),
    ...(parts.showLabel && input.model.label.length > 0 && input.model.labelPosition === 'end'
      ? [progressPartSpan(input, ` ${input.model.label}`, 'label', 'label', decorated)]
      : []),
  ];
  return Math.max(
    1,
    Math.min(
      input.model.barWidth,
      maxCells - measureRenderSpans(withoutBar, { widthProfile: input.widthProfile }),
    ),
  );
}

function progressParts(model: ProgressBarModel): ProgressParts {
  return {
    showLabel: model.labelPosition !== 'none',
    showValue: model.display === 'bar+value' || model.display === 'bar+value+percent',
    showPercentage: model.display === 'bar+percent' || model.display === 'bar+value+percent',
    showTiming: model.elapsedMs !== undefined || model.remainingMs !== undefined,
  };
}

function progressTrackSpans(
  input: ProgressVisualInput,
  barWidth: number,
  decorated: boolean,
): readonly RenderSpan[] {
  if (input.model.indeterminate) return indeterminateProgressSpans(input, barWidth, decorated);
  const filledCells = Math.round((input.model.value / input.model.max) * barWidth);
  const filled = input.model.valueScale.length === 0
    ? [
      progressPartSpan(
        input,
        fillTextCells(input.theme.tokens.symbols.progressFilled, filledCells, {
          widthProfile: input.widthProfile,
        }),
        'fill',
        'filled',
        decorated,
        progressFillStyle(input.model.status),
        'decoration',
      ),
    ]
    : scaledProgressFillSpans(input, filledCells, barWidth, decorated);
  return [
    ...filled,
    progressPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressEmpty, barWidth - filledCells, {
        widthProfile: input.widthProfile,
      }),
      'track',
      'track',
      decorated,
      progressTrackStyle(),
      'decoration',
    ),
  ];
}

function indeterminateProgressSpans(
  input: ProgressVisualInput,
  barWidth: number,
  decorated: boolean,
): readonly RenderSpan[] {
  const slotCells = Math.max(
    1,
    measureTextCells(input.theme.tokens.symbols.progressFilled, {
      widthProfile: input.widthProfile,
    }).cells,
    measureTextCells(input.theme.tokens.symbols.progressEmpty, { widthProfile: input.widthProfile })
      .cells,
  );
  const frame = indeterminateProgressFrame(
    input.model.frame,
    Math.max(1, Math.ceil(barWidth / slotCells)),
  );
  let remaining = barWidth;
  return frame.cells.flatMap((cell): readonly RenderSpan[] => {
    if (remaining === 0) return [];
    const cells = Math.min(slotCells, remaining);
    remaining -= cells;
    return [progressPartSpan(
      input,
      fillTextCells(
        cell.active
          ? input.theme.tokens.symbols.progressFilled
          : input.theme.tokens.symbols.progressEmpty,
        cells,
        { widthProfile: input.widthProfile },
      ),
      cell.active ? 'fill' : 'track',
      cell.active ? 'active' : 'track',
      decorated,
      cell.active ? progressFillStyle(input.model.status) : progressTrackStyle(),
      'decoration',
    )];
  });
}

function scaledProgressFillSpans(
  input: ProgressVisualInput,
  filledCells: number,
  barWidth: number,
  decorated: boolean,
): readonly RenderSpan[] {
  const glyphCells = Math.max(
    1,
    measureTextCells(input.theme.tokens.symbols.progressFilled, {
      widthProfile: input.widthProfile,
    }).cells,
  );
  const spans: RenderSpan[] = [];
  for (let usedCells = 0; usedCells < filledCells;) {
    const cells = Math.min(glyphCells, filledCells - usedCells);
    const value = ((usedCells + cells) / Math.max(1, barWidth)) * input.model.max;
    spans.push(progressPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressFilled, cells, {
        widthProfile: input.widthProfile,
      }),
      'fill',
      `segment.${String(spans.length)}.filled`,
      decorated,
      progressScaleStyle(
        value,
        input.model.max,
        input.model.valueScale,
        progressFillStyle(input.model.status),
      ),
      'decoration',
    ));
    usedCells += cells;
  }
  return spans;
}

function progressStatusSpans(
  input: ProgressVisualInput,
  decorated: boolean,
): readonly RenderSpan[] {
  if (input.model.status === 'running') return [];
  return [
    progressPartSpan(
      input,
      processStatusMarker(input.model.status, input.theme),
      'marker',
      'status.marker',
      decorated,
      processStatusStyle(input.model.status),
      'decoration',
    ),
    progressPartSpan(input, ' ', 'marker', 'status.gap', decorated, undefined, 'separator'),
  ];
}

function progressMetricSpans(
  input: ProgressVisualInput,
  parts: ProgressParts,
  decorated: boolean,
): readonly RenderSpan[] {
  if (input.model.indeterminate) {
    const timing = timingText(input.model);
    return parts.showTiming && timing.length > 0
      ? [progressPartSpan(input, ` ${timing}`, 'value', 'timing', decorated)]
      : [];
  }
  const timing = timingText(input.model);
  return [
    ...(parts.showValue
      ? [progressPartSpan(
        input,
        ` ${String(input.model.value)}/${String(input.model.max)}`,
        'value',
        'value',
        decorated,
      )]
      : []),
    ...(parts.showPercentage
      ? [progressPartSpan(
        input,
        ` ${String(input.model.percentage)}%`,
        'value',
        'percentage',
        decorated,
      )]
      : []),
    ...(parts.showTiming && timing.length > 0
      ? [progressPartSpan(input, ` ${timing}`, 'value', 'timing', decorated)]
      : []),
  ];
}

function progressPartSpan(
  input: ProgressVisualInput,
  textValue: string,
  part: ProgressBarStylePart,
  partName: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/source.ts').FrameCellRole = 'text',
): RenderSpan {
  if (!decorated || input.style === undefined || input.source === undefined) return span(textValue);
  const style = input.style({ part, ...(base === undefined ? {} : { base }) });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.source({ cellRole, partName, partType: 'progress' }),
  });
}

function progressFillStyle(status: ProcessStatus): TerminalStyle {
  if (status === 'error' || status === 'warning' || status === 'success') {
    return processStatusStyle(status);
  }
  return { fg: { kind: 'theme', token: 'control.track.filled' }, bold: true };
}

function progressTrackStyle(): TerminalStyle {
  return { fg: { kind: 'theme', token: 'control.track' }, dim: true };
}

function progressScaleStyle(
  value: number,
  max: number,
  stops: readonly ValueScaleStop[],
  base: TerminalStyle,
): TerminalStyle {
  if (stops.length === 0 || max <= 0) return base;
  const ratio = Math.max(0, Math.min(1, value / max));
  let selected = stops[0];
  for (const stop of stops) {
    if (ratio < stop.at) break;
    selected = stop;
  }
  return selected === undefined
    ? base
    : { ...base, fg: { kind: 'theme', token: selected.token }, bold: true };
}

function prepareValueScaleFor(
  value: ValueScale | undefined,
  component: string,
): readonly ValueScaleStop[] {
  if (value === undefined) return [];
  if (value.length > 32) {
    throw new RangeError(`${component} valueScale cannot contain more than 32 stops.`);
  }
  return value.map((stop) => {
    const { at, token, label } = stop;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > 1) {
      throw new RangeError(
        `${component} valueScale stop positions must be finite values from 0 through 1.`,
      );
    }
    if (typeof token !== 'string' || !isThemeColorToken(token)) {
      throw new TypeError(`${component} valueScale stop tokens must be valid theme color tokens.`);
    }
    if (label !== undefined && (typeof label !== 'string' || label.trim().length === 0)) {
      throw new TypeError(`${component} valueScale stop labels must be non-empty strings.`);
    }
    return {
      at: stop.at,
      token: stop.token,
      ...(stop.label === undefined ? {} : { label: sanitizeLine(stop.label) }),
    };
  })
    .sort((left, right) => left.at - right.at);
}

function progressDescription(model: ProgressBarModel): { readonly description?: string } {
  const textValue = timingText(model);
  return textValue.length === 0 ? {} : { description: textValue };
}

function timingText(model: ProgressBarModel): string {
  return [
    model.elapsedMs === undefined ? undefined : `${formatDuration(model.elapsedMs)} elapsed`,
    model.remainingMs === undefined ? undefined : `${formatDuration(model.remainingMs)} left`,
  ].filter((part): part is string => part !== undefined).join(' ');
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  if (totalSeconds < 60) return `${String(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0
      ? `${String(minutes)}m`
      : `${String(minutes)}m${String(seconds).padStart(2, '0')}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${String(hours)}h`
    : `${String(hours)}h${String(remainingMinutes).padStart(2, '0')}m`;
}

interface SparklineModel {
  readonly label: string;
  readonly values: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly dataState?: import('../../ui-model/feedback.ts').ChartDataState;
  readonly valueScale: readonly ValueScaleStop[];
  readonly emptyText: string;
  readonly loadingText: string;
  readonly errorText: string;
}

export const sparkline: SemanticLeafComponentFactory<
  Pick<
    SparklineOptions,
    | 'label'
    | 'values'
    | 'min'
    | 'max'
    | 'dataState'
    | 'valueScale'
    | 'emptyText'
    | 'loadingText'
    | 'errorText'
  >,
  never,
  SparklineStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<
    SparklineOptions,
    | 'label'
    | 'values'
    | 'min'
    | 'max'
    | 'dataState'
    | 'valueScale'
    | 'emptyText'
    | 'loadingText'
    | 'errorText'
  >,
  SparklineModel,
  never,
  SparklineStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/sparkline',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  metadata: ['styles', 'layer'],
  parts: ['value', 'muted', 'series'],
  prepare(value) {
    const label = value.label;
    const values = value.values;
    assertAccessibleLabel(label, 'sparkline');
    assertFiniteValues(values, 'sparkline values');
    assertNumericDomain(value.min, value.max, 'sparkline');
    assertChartDataState(value.dataState, 'sparkline');
    const min = typeof value.min === 'number'
      ? value.min
      : values.length === 0
      ? 0
      : Math.min(...values);
    const candidateMax = typeof value.max === 'number'
      ? value.max
      : values.length === 0
      ? 1
      : Math.max(...values);
    return {
      label: sanitizeLine(label),
      values: [...values],
      min,
      max: candidateMax <= min ? min + 1 : candidateMax,
      ...(value.dataState === undefined ? {} : { dataState: value.dataState }),
      valueScale: prepareValueScaleFor(value.valueScale, 'sparkline'),
      emptyText: prepareOptionalLine(
        value.emptyText,
        'sparkline emptyText',
        'No sparkline data',
      ),
      loadingText: prepareOptionalLine(
        value.loadingText,
        'sparkline loadingText',
        'Loading data',
      ),
      errorText: prepareOptionalLine(
        value.errorText,
        'sparkline errorText',
        'Unable to render data',
      ),
    };
  },
  measure(input) {
    return singleLineMeasurement(sparklineSpans(input, false), input.widthProfile);
  },
  render(input) {
    input.target.write(0, 0, sparklineSpans(input, true));
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'text',
      label: model.label,
      ...(model.values.length === 0 ? {} : { value: `${String(model.values.length)} points` }),
      description: `${String(model.values.length)} sparkline points.`,
    };
  },
});

interface SparklineVisualInput {
  readonly model: SparklineModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly style?: ComponentRenderInput<SparklineModel, SparklineStylePart>['style'];
  readonly source?: ComponentRenderInput<SparklineModel, SparklineStylePart>['source'];
}

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

function sparklineSpans(input: SparklineVisualInput, decorated: boolean): readonly RenderSpan[] {
  const message = input.model.dataState === 'loading'
    ? { kind: 'loading' as const, text: input.model.loadingText, status: 'running' as const }
    : input.model.dataState === 'error'
    ? { kind: 'error' as const, text: input.model.errorText, status: 'error' as const }
    : input.model.values.length === 0
    ? { kind: 'empty' as const, text: input.model.emptyText, status: 'idle' as const }
    : undefined;
  if (message !== undefined) {
    return [
      chartPartSpan(
        input,
        processStatusMarker(message.status, input.theme),
        'muted',
        `state.${message.kind}.marker`,
        decorated,
        processStatusStyle(message.status),
        'decoration',
      ),
      chartPartSpan(
        input,
        ' ',
        'muted',
        `state.${message.kind}.separator`,
        decorated,
        undefined,
        'separator',
      ),
      chartPartSpan(
        input,
        message.text,
        message.kind === 'error' ? 'value' : 'muted',
        `state.${message.kind}.message`,
        decorated,
        message.kind === 'error'
          ? processStatusStyle('error')
          : { fg: { kind: 'theme', token: 'chart.muted' }, dim: true },
        'text',
      ),
    ];
  }
  return input.model.values.map((value, index) => {
    const ratio = (value - input.model.min) / (input.model.max - input.model.min);
    const glyphIndex = Math.max(
      0,
      Math.min(sparkGlyphs.length - 1, Math.round(ratio * (sparkGlyphs.length - 1))),
    );
    const base: TerminalStyle = { fg: { kind: 'theme', token: 'chart.series.1' }, bold: true };
    return chartPartSpan(
      input,
      sparkGlyphs[glyphIndex] ?? sparkGlyphs[0],
      'series',
      `point.${String(index)}`,
      decorated,
      progressScaleStyle(
        value - input.model.min,
        input.model.max - input.model.min,
        input.model.valueScale,
        base,
      ),
      'chart',
    );
  });
}

function chartPartSpan<TModel extends object>(
  input: {
    readonly style?: ComponentRenderInput<TModel, SparklineStylePart>['style'];
    readonly source?: ComponentRenderInput<TModel, SparklineStylePart>['source'];
  },
  textValue: string,
  part: SparklineStylePart,
  partName: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/source.ts').FrameCellRole = 'chart',
): RenderSpan {
  if (!decorated || input.style === undefined || input.source === undefined) return span(textValue);
  const style = input.style({ part, ...(base === undefined ? {} : { base }) });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.source({
      cellRole,
      partName,
      partType: 'chart',
      description: partName,
    }),
  });
}

function prepareOptionalLine(value: string | undefined, label: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const prepared = sanitizeLine(value).trim();
  return prepared.length === 0 ? fallback : prepared;
}

interface MeterModel {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly width: number;
  readonly variant: import('../../ui-model/feedback.ts').MeterVariant;
  readonly result?: import('../../ui-model/feedback.ts').MeterResult;
}

export const meter: SemanticLeafComponentFactory<
  Pick<MeterOptions, 'label' | 'value' | 'min' | 'max' | 'width' | 'variant' | 'result'>,
  never,
  MeterStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<MeterOptions, 'label' | 'value' | 'min' | 'max' | 'width' | 'variant' | 'result'>,
  MeterModel,
  never,
  MeterStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/meter',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'meter',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value', 'track', 'fill'],
  prepare(value) {
    const label = value.label;
    const current = value.value;
    const min = value.min;
    const max = value.max;
    const width = value.width;
    const variant = value.variant;
    const result = value.result;
    assertAccessibleLabel(label, 'meter');
    assertFiniteNumber(current, 'meter value');
    assertNumericDomain(min, max, 'meter');
    assertPositiveSafeInteger(width, 'meter width');
    assertMeterResult(result);
    assertOptionalEnum(variant, ['linear', 'dial'], 'meter variant');
    const minimum = typeof min === 'number' ? min : 0;
    const maximum = Math.max(minimum + 1, typeof max === 'number' ? max : 100);
    return {
      label: sanitizeLine(label),
      value: current,
      min: minimum,
      max: maximum,
      width: typeof width === 'number' ? Math.max(4, Math.min(40, Math.floor(width))) : 12,
      variant: variant ?? 'linear',
      ...(result === undefined ? {} : { result }),
    };
  },
  measure(input) {
    const lines = meterLines(input, false);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(
        0,
        ...lines.map((current) =>
          measureRenderSpans(current, {
            widthProfile: input.widthProfile,
          })
        ),
      ),
      preferredHeight: lines.length,
    };
  },
  render(input) {
    input.target.writeBlock(0, 0, {
      lines: meterLines(input, true).map((spans) => ({ spans })),
    });
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'meter',
      ...(model.label === '' ? {} : { label: model.label }),
      value: model.value,
      numericValue: { current: model.value, minimum: model.min, maximum: model.max },
      description: `Meter from ${String(model.min)} to ${String(model.max)}.`,
    };
  },
});

interface MeterVisualInput {
  readonly model: MeterModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
  readonly style?: ComponentRenderInput<MeterModel, MeterStylePart>['style'];
  readonly source?: ComponentRenderInput<MeterModel, MeterStylePart>['source'];
}

function meterLines(
  input: MeterVisualInput,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const ratio = Math.max(
    0,
    Math.min(1, (input.model.value - input.model.min) / (input.model.max - input.model.min)),
  );
  return input.model.variant === 'dial'
    ? meterDialLines(input, ratio, decorated)
    : [meterLinearSpans(input, ratio, decorated)];
}

function meterLinearSpans(
  input: MeterVisualInput,
  ratio: number,
  decorated: boolean,
): readonly RenderSpan[] {
  const filled = Math.round(ratio * input.model.width);
  const resultStyle = meterResultStyle(input.model.result);
  return [
    meterPartSpan(input, input.model.label, 'label', 'metric.label', decorated),
    meterPartSpan(
      input,
      ' ',
      'track',
      'metric.separator.afterLabel',
      decorated,
      undefined,
      'separator',
    ),
    meterPartSpan(input, '[', 'track', 'metric.bar.open', decorated, undefined, 'decoration'),
    meterPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressFilled, filled, {
        widthProfile: input.widthProfile,
      }),
      'fill',
      'metric.bar.filled',
      decorated,
      resultStyle,
      'decoration',
    ),
    meterPartSpan(
      input,
      fillTextCells(input.theme.tokens.symbols.progressEmpty, input.model.width - filled, {
        widthProfile: input.widthProfile,
      }),
      'track',
      'metric.bar.empty',
      decorated,
      undefined,
      'decoration',
    ),
    meterPartSpan(input, ']', 'track', 'metric.bar.close', decorated, undefined, 'decoration'),
    meterPartSpan(
      input,
      ' ',
      'track',
      'metric.separator.beforeValue',
      decorated,
      undefined,
      'separator',
    ),
    meterPartSpan(
      input,
      `${String(Math.round(ratio * 100))}%`,
      'value',
      'metric.value',
      decorated,
      resultStyle,
    ),
    ...(input.model.result === undefined ? [] : [
      meterPartSpan(input, ' ', 'track', 'result.separator', decorated, undefined, 'separator'),
      meterPartSpan(input, input.model.result, 'value', 'result.value', decorated, resultStyle),
    ]),
  ];
}

function meterDialLines(
  input: MeterVisualInput,
  ratio: number,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  const filled = Math.round(ratio * input.model.width);
  const resultStyle = meterResultStyle(input.model.result);
  const marker = '▲';
  const markerWidth = measureTextCells(marker, { widthProfile: input.widthProfile }).cells;
  const markerColumn = Math.max(
    0,
    Math.min(
      input.model.width - markerWidth,
      Math.round(ratio * Math.max(0, input.model.width - markerWidth)),
    ),
  );
  return [
    [meterPartSpan(input, input.model.label, 'label', 'dial.label', decorated)],
    [
      meterPartSpan(
        input,
        oneCellGlyph('╭', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.open',
        decorated,
      ),
      meterPartSpan(
        input,
        fillTextCells('─', filled, { widthProfile: input.widthProfile }),
        'fill',
        'dial.filled',
        decorated,
        resultStyle,
      ),
      meterPartSpan(
        input,
        fillTextCells('─', input.model.width - filled, { widthProfile: input.widthProfile }),
        'track',
        'dial.empty',
        decorated,
      ),
      meterPartSpan(
        input,
        oneCellGlyph('╮', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.close',
        decorated,
      ),
    ],
    [
      meterPartSpan(
        input,
        oneCellGlyph('│', '|', { widthProfile: input.widthProfile }),
        'track',
        'dial.side.left',
        decorated,
      ),
      meterPartSpan(
        input,
        `${' '.repeat(markerColumn)}${marker}${
          ' '.repeat(
            Math.max(0, input.model.width - markerColumn - markerWidth),
          )
        }`,
        'marker',
        'dial.needle',
        decorated,
        resultStyle,
      ),
      meterPartSpan(
        input,
        oneCellGlyph('│', '|', { widthProfile: input.widthProfile }),
        'track',
        'dial.side.right',
        decorated,
      ),
      meterPartSpan(
        input,
        ' ',
        'track',
        'dial.separator.beforeValue',
        decorated,
        undefined,
        'separator',
      ),
      meterPartSpan(input, `${String(Math.round(ratio * 100))}%`, 'value', 'dial.value', decorated),
    ],
    [
      meterPartSpan(
        input,
        oneCellGlyph('╰', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.bottom.open',
        decorated,
      ),
      meterPartSpan(
        input,
        fillTextCells('─', input.model.width, { widthProfile: input.widthProfile }),
        'track',
        'dial.bottom.edge',
        decorated,
      ),
      meterPartSpan(
        input,
        oneCellGlyph('╯', '+', { widthProfile: input.widthProfile }),
        'track',
        'dial.bottom.close',
        decorated,
      ),
    ],
  ];
}

function meterPartSpan(
  input: MeterVisualInput,
  textValue: string,
  part: MeterStylePart,
  partName: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/source.ts').FrameCellRole = 'chart',
): RenderSpan {
  if (!decorated || input.style === undefined || input.source === undefined) return span(textValue);
  const defaultBase = part === 'track'
    ? { fg: { kind: 'theme' as const, token: 'chart.muted' as const }, dim: true }
    : part === 'fill'
    ? { fg: { kind: 'theme' as const, token: 'chart.series.1' as const }, bold: true }
    : undefined;
  const resolvedBase = base ?? defaultBase;
  const style = input.style({
    part,
    ...(resolvedBase === undefined ? {} : { base: resolvedBase }),
  });
  return span(textValue, {
    ...(style === undefined ? {} : { style }),
    source: input.source({
      cellRole,
      partName,
      partType: partName === 'metric.value' || partName === 'dial.value'
        ? 'metric'
        : partName === 'result.value'
        ? 'result'
        : 'meter',
      description: partName,
    }),
  });
}

function meterResultStyle(result: MeterModel['result']): TerminalStyle {
  return result === undefined
    ? { fg: { kind: 'theme', token: 'chart.series.1' }, bold: true }
    : processStatusStyle(result);
}

function assertAccessibleLabel(value: unknown, component: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${component} requires a non-empty label.`);
  }
}

function assertFiniteValues(
  values: readonly number[],
  subject: string,
): void {
  if (!Array.isArray(values)) throw new TypeError(`${subject} must be an array.`);
  for (const value of values) assertFiniteNumber(value, `${subject} item`);
}

function assertNumericDomain(
  minimum: number | undefined,
  maximum: number | undefined,
  component: string,
): void {
  assertOptionalFiniteNumber(minimum, `${component} min`);
  assertOptionalFiniteNumber(maximum, `${component} max`);
  if (
    typeof minimum === 'number' &&
    typeof maximum === 'number' &&
    maximum < minimum
  ) {
    throw new RangeError(`${component} max must be greater than or equal to min.`);
  }
}

function assertPositiveSafeInteger(value: number | undefined, subject: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
}

function sanitizeLine(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function assertChartDataState(
  value: unknown,
  component: string,
): asserts value is import('../../ui-model/feedback.ts').ChartDataState | undefined {
  if (value === undefined || value === 'loading' || value === 'error') return;
  throw new TypeError(`${component} dataState must be loading or error.`);
}

function assertMeterResult(
  value: unknown,
): asserts value is import('../../ui-model/feedback.ts').MeterResult | undefined {
  if (value === undefined || value === 'success' || value === 'warning' || value === 'error') {
    return;
  }
  throw new TypeError('meter result must be success, warning, or error.');
}

function assertProcessStatus(
  value: unknown,
  component: string,
): asserts value is ProcessStatus | undefined {
  if (value === undefined || isProcessStatus(value)) return;
  throw new TypeError(`${component} status must be idle, running, success, warning, or error.`);
}
