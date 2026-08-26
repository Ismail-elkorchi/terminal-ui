import {
  assertFiniteNumber,
  assertOptionalFiniteNumber,
} from '../../foundation/validation.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import { measureRenderSpans } from '../../component/index.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { ValueScale, ValueScaleStop } from '../../behavior/visualization-data.ts';
import { isThemeColorToken } from '../../visual/color.ts';
import type { ProcessStatus } from '../status-bar.ts';
import { isProcessStatus } from '../status.ts';

export function assertAccessibleLabel(value: unknown, component: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${component} requires a non-empty label.`);
  }
}

export function assertFiniteValues(values: readonly number[], subject: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${subject} must be an array.`);
  for (const value of values) assertFiniteNumber(value, `${subject} item`);
}

export function assertNumericDomain(
  minimum: number | undefined,
  maximum: number | undefined,
  component: string,
): void {
  assertOptionalFiniteNumber(minimum, `${component} min`);
  assertOptionalFiniteNumber(maximum, `${component} max`);
  if (typeof minimum === 'number' && typeof maximum === 'number' && maximum < minimum) {
    throw new RangeError(`${component} max must be greater than or equal to min.`);
  }
}

export function assertPositiveSafeInteger(value: number | undefined, subject: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
}

export function sanitizeLine(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function assertChartDataStatus(
  value: unknown,
  component: string,
): asserts value is import('../../behavior/visualization-data.ts').ChartDataStatus | undefined {
  if (value === undefined || value === 'loading' || value === 'error') return;
  throw new TypeError(`${component} dataStatus must be loading or error.`);
}

export function assertMeterStatus(
  value: unknown,
): asserts value is import('../../behavior/visualization-data.ts').MeterStatus | undefined {
  if (value === undefined || value === 'success' || value === 'warning' || value === 'error') return;
  throw new TypeError('meter status must be success, warning, or error.');
}

export function assertProcessStatus(
  value: unknown,
  component: string,
): asserts value is ProcessStatus | undefined {
  if (value === undefined || isProcessStatus(value)) return;
  throw new TypeError(`${component} status must be idle, running, success, warning, or error.`);
}

export function singleLineMeasurement(
  spans: readonly RenderSpan[],
  widthProfile: TextWidthProfile,
): import('../../renderer/index.ts').Measurement {
  return {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: measureRenderSpans(spans, { widthProfile }),
    preferredHeight: 1,
  };
}

export function processStatusMarker(status: ProcessStatus, theme: TerminalTheme): string {
  switch (status) {
    case 'running': return theme.tokens.symbols.statusInfo;
    case 'success': return theme.tokens.symbols.statusSuccess;
    case 'warning': return theme.tokens.symbols.statusWarning;
    case 'error': return theme.tokens.symbols.statusError;
    case 'idle': return theme.tokens.symbols.progressEmpty;
  }
}

export function processStatusStyle(status: ProcessStatus): TerminalStyle {
  const token = status === 'running'
    ? 'status.running'
    : status === 'success'
    ? 'status.success'
    : status === 'warning'
    ? 'status.warning'
    : status === 'error'
    ? 'status.error'
    : 'status.pending';
  return { fg: { kind: 'theme', token }, bold: status === 'error' || status === 'success' };
}

export function progressScaleStyle(
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

export function decodeValueScaleFor(
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
      throw new RangeError(`${component} valueScale stop positions must be finite values from 0 through 1.`);
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
  }).sort((left, right) => left.at - right.at);
}
