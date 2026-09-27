import type { ValueScale, ValueScaleStop } from '../../behavior/visualization-data.ts';
import type { ComponentRenderInput } from '../../component/contracts.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredPropertyCallback,
  isStringMember,
} from '../../foundation/validation.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import { isThemeColorToken } from '../../visual/color.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { span } from '../../visual/render-content.ts';
import type { ChartStylePart } from '../style-parts.ts';
import type { ChartStatus, ChartStatusOptions, WithoutVisualizationBehavior } from './contracts.ts';

export function assertVisualizationCallbacks<TOptions extends {
    readonly onTransition?: unknown;
    readonly onActivate?: unknown;
  }>(
  options: TOptions,
  component: string,
): asserts options is TOptions & { readonly onTransition: NonNullable<TOptions['onTransition']> } {
  assertRequiredPropertyCallback(options, 'onTransition', `${component} onTransition`);
  assertOptionalCallback(options.onActivate, `${component} onActivate`);
}

export function visualizationUnavailable(options: { readonly disabled?: boolean; readonly inert?: boolean }): boolean {
  return options.disabled === true || options.inert === true;
}

export function withoutVisualizationBehavior<TOptions extends {
  readonly onTransition?: unknown;
  readonly onActivate?: unknown;
}>(options: TOptions): WithoutVisualizationBehavior<TOptions> {
  return Object.fromEntries(Object.entries(options).filter(([field]) =>
    field !== 'onTransition' && field !== 'onActivate'
  )) as WithoutVisualizationBehavior<TOptions>;
}

export function decodeVisualizationStatus(
  value: Readonly<ChartStatusOptions>,
  owner: string,
  empty: boolean,
): ChartStatus {
  const dataStatus = value.dataStatus;
  assertOptionalEnum(dataStatus, ['loading', 'error'], `${owner} dataStatus`);
  return {
    ...(dataStatus === undefined ? {} : { dataStatus }),
    empty,
    emptyText: optionalText(value.emptyText, `${owner} emptyText`) ?? 'No data',
    loadingText: optionalText(value.loadingText, `${owner} loadingText`) ?? 'Loading',
    errorText: optionalText(value.errorText, `${owner} errorText`) ?? 'Unavailable',
  };
}

export function paintStatus<TModel extends ChartStatus>(
  input: ComponentRenderInput<TModel, ChartStylePart>,
  model: TModel,
): boolean {
  const kind = model.dataStatus ?? (model.empty ? 'empty' : undefined);
  if (kind === undefined) return false;
  const text = kind === 'loading'
    ? model.loadingText
    : kind === 'error'
    ? model.errorText
    : model.emptyText;
  input.target.write(0, 0, [chartSpan(
    input,
    text,
    kind === 'error' ? 'value' : 'muted',
    `state.${kind}.message`,
    kind,
    kind === 'error'
      ? { fg: { kind: 'theme', token: 'status.error' }, bold: true }
      : { fg: { kind: 'theme', token: 'chart.muted' }, dim: true },
  )]);
  return true;
}

export function chartSpan<TModel extends object>(
  input: ComponentRenderInput<TModel, ChartStylePart>,
  text: string,
  part: ChartStylePart,
  description: string,
  partType: string,
  base?: TerminalStyle,
  itemIndex?: number,
  stateOrStates?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> |
    readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): RenderSpan {
  const states = stateOrStates === undefined
    ? (partType === 'selected' ? ['selected' as const] : [])
    : typeof stateOrStates === 'string' ? [stateOrStates] : stateOrStates;
  const state = states.at(-1);
  const semanticBase = base ?? (
    part === 'label'
      ? { fg: { kind: 'theme', token: 'chart.label' } } as const
      : part === 'value'
      ? { fg: { kind: 'theme', token: 'chart.value' } } as const
      : undefined
  );
  const style = input.style({
    part,
    ...(states.length === 0 ? {} : { states }),
    ...(semanticBase === undefined ? {} : { base: semanticBase }),
  });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: partType === 'separator' || partType === 'baseline'
        ? 'separator'
        : partType === 'label' || partType === 'legend' || partType === 'metric' ||
            partType === 'empty' || partType === 'loading' || partType === 'error'
        ? 'text'
        : partType === 'marker'
        ? 'decoration'
        : 'chart',
      partName: description,
      partType,
      description,
      ...(itemIndex === undefined ? {} : { itemIndex }),
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  });
}

export function seriesStyle(index: number): TerminalStyle {
  return { fg: seriesThemeColor(index), bold: true };
}

export function selectedStyle(): TerminalStyle {
  return {
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true,
  };
}

export function polarityStyle(polarity: 'positive' | 'negative'): TerminalStyle {
  return {
    fg: { kind: 'theme', token: polarity === 'positive' ? 'chart.positive' : 'chart.negative' },
    bold: true,
  };
}

function seriesThemeColor(index: number): {
  readonly kind: 'theme';
  readonly token: 'chart.series.1' | 'chart.series.2' | 'chart.series.3';
} {
  switch (index % 3) {
    case 1:
      return { kind: 'theme', token: 'chart.series.2' };
    case 2:
      return { kind: 'theme', token: 'chart.series.3' };
    default:
      return { kind: 'theme', token: 'chart.series.1' };
  }
}

export function numericRange(
  values: readonly number[],
  rawMin: unknown,
  rawMax: unknown,
  owner: string,
): { readonly min: number; readonly max: number } {
  const explicitMin = optionalFinite(rawMin, `${owner} min`);
  const explicitMax = optionalFinite(rawMax, `${owner} max`);
  const min = explicitMin ?? (values.length === 0 ? 0 : Math.min(...values));
  const candidateMax = explicitMax ?? (values.length === 0 ? 1 : Math.max(...values));
  if (explicitMin !== undefined && explicitMax !== undefined && candidateMax <= min) {
    throw new RangeError(`${owner} max must be greater than min.`);
  }
  return { min, max: candidateMax <= min ? min + 1 : candidateMax };
}

export function normalizedIndex(
  value: number,
  range: { readonly minimum: number; readonly maximum: number },
  maximum: number,
): number {
  const ratio = Math.max(0, Math.min(1, (value - range.minimum) / (range.maximum - range.minimum)));
  return Math.max(0, Math.min(maximum, Math.round(ratio * maximum)));
}

export function decodeValueScale(value: ValueScale | undefined, owner: string): readonly ValueScaleStop[] {
  if (value === undefined) return Object.freeze([]);
  if (value.length > 32) throw new RangeError(`${owner} cannot contain more than 32 stops.`);
  const stops = value.map((raw, index): ValueScaleStop => {
    const at = finite(raw.at, `${owner}[${String(index)}].at`);
    if (at < 0 || at > 1) throw new RangeError(`${owner} stop positions must be from 0 through 1.`);
    const token = raw.token;
    if (typeof token !== 'string' || !isThemeColorToken(token)) {
      throw new TypeError(`${owner} stop tokens must be valid theme color tokens.`);
    }
    const label = optionalText(raw.label, `${owner}[${String(index)}].label`);
    if (label?.trim() === '') {
      throw new TypeError(`${owner} stop labels must be non-empty.`);
    }
    return Object.freeze({ at, token, ...(label === undefined ? {} : { label }) });
  });
  return Object.freeze([...stops].sort((left, right) => left.at - right.at));
}

export function visibleWindow(total: number, height: number, preferred: number) {
  const count = Math.max(0, Math.min(total, Math.floor(height)));
  if (count === 0) return { start: 0, end: 0 };
  const center = Math.max(0, Math.min(total - 1, preferred));
  const start = Math.max(0, Math.min(total - count, center - Math.floor(count / 2)));
  return { start, end: start + count };
}

export function optionalGlyph(value: unknown, owner: string): { readonly glyph?: string } {
  const glyph = optionalText(value, owner);
  if (glyph === undefined) return {};
  if (Array.from(glyph).length !== 1) throw new TypeError(`${owner} must be one glyph.`);
  return { glyph };
}

export function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
  owner: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`${owner} must be a safe integer.`);
  }
  if (value < minimum || value > maximum) {
    throw new RangeError(`${owner} must be from ${String(minimum)} through ${String(maximum)}.`);
  }
  return value;
}

export function optionalEnum<const TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  owner: string,
): TValue | undefined {
  if (value === undefined) return undefined;
  if (!isStringMember(value, allowed)) {
    throw new TypeError(`${owner} is invalid.`);
  }
  return value;
}

export function optionalText(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function nonEmpty(value: unknown, owner: string): string {
  const result = optionalText(value, owner);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${owner} must be a non-empty string.`);
  }
  return result;
}

export function finite(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${owner} must be finite.`);
  }
  return value;
}

export function optionalFinite(value: unknown, owner: string): number | undefined {
  return value === undefined ? undefined : finite(value, owner);
}

export function optionalBoolean(value: unknown, owner: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}
