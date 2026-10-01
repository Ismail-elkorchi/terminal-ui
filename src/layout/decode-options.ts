import type { LayoutFlowOptions, LayoutInsetInput, LayoutSize } from '../geometry/types.ts';

/** Validates and detaches layout fields retained by a layout or component. */
export function decodeLayoutFlowOptions(
  value: unknown,
  owner: string
): LayoutFlowOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${owner} options must be an object.`);
  }
  const options = value as Readonly<Record<string, unknown>>;
  const result: {
    gap?: number;
    padding?: LayoutInsetInput;
    margin?: LayoutInsetInput;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    align?: NonNullable<LayoutFlowOptions['align']>;
    justify?: NonNullable<LayoutFlowOptions['justify']>;
    overflow?: NonNullable<LayoutFlowOptions['overflow']>;
  } = {};
  Object.assign(result, decodeLayoutDimensions(options, owner));
  Object.assign(result, decodeLayoutInsets(options, owner));
  Object.assign(result, decodeLayoutAlignment(options, owner));
  return Object.freeze(result);
}

/** Adopts a cell count without silently flooring invalid public geometry. */
export function decodeLayoutCellCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

/** Owns tracks once so later caller mutation cannot change an element's geometry. */
export function decodeLayoutTracks(value: unknown, owner: string): readonly LayoutSize[] {
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array of layout tracks.`);
  return Object.freeze(Array.from(value, (track: unknown): LayoutSize => {
    if (typeof track !== 'object' || track === null || Array.isArray(track)) {
      throw new TypeError(`${owner} track must be an object.`);
    }
    const input = track as Readonly<Record<string, unknown>>;
    switch (input['kind']) {
      case 'fixed':
        return Object.freeze({ kind: 'fixed', cells: decodeLayoutCellCount(input['cells'], `${owner} fixed cells`) });
      case 'percent': {
        const percent = input['value'];
        if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
          throw new RangeError(`${owner} percent value must be finite and between 0 and 100.`);
        }
        return Object.freeze({ kind: 'percent', value: percent });
      }
      case 'fill': {
        const weight = input['weight'];
        if (weight === undefined) return Object.freeze({ kind: 'fill' });
        const cells = decodeLayoutCellCount(weight, `${owner} fill weight`);
        if (cells === 0) throw new RangeError(`${owner} fill weight must be positive.`);
        return Object.freeze({ kind: 'fill', weight: cells });
      }
      case 'content': {
        const min = input['min'] === undefined ? undefined : decodeLayoutCellCount(input['min'], `${owner} content min`);
        const max = input['max'] === undefined ? undefined : decodeLayoutCellCount(input['max'], `${owner} content max`);
        if (min !== undefined && max !== undefined && min > max) {
          throw new RangeError(`${owner} content min must not exceed max.`);
        }
        return Object.freeze({ kind: 'content', ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) });
      }
      default:
        throw new TypeError(`${owner} track kind must be fixed, percent, fill, or content.`);
    }
  }));
}

function decodeLayoutDimensions(
  options: Readonly<Record<string, unknown>>,
  owner: string,
): Pick<LayoutFlowOptions, 'gap' | 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight'> {
  const result: { gap?: number; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number } = {};
  for (const field of ['gap', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const) {
    const member = options[field];
    if (member === undefined) continue;
    result[field] = decodeLayoutCellCount(member, `${owner} ${field}`);
  }
  if (result.minWidth !== undefined && result.maxWidth !== undefined && result.minWidth > result.maxWidth) {
    throw new RangeError(`${owner} minWidth must not exceed maxWidth.`);
  }
  if (result.minHeight !== undefined && result.maxHeight !== undefined && result.minHeight > result.maxHeight) {
    throw new RangeError(`${owner} minHeight must not exceed maxHeight.`);
  }
  return result;
}

function decodeLayoutInsets(
  options: Readonly<Record<string, unknown>>,
  owner: string,
): Pick<LayoutFlowOptions, 'padding' | 'margin'> {
  const result: { padding?: LayoutInsetInput; margin?: LayoutInsetInput } = {};
  for (const field of ['padding', 'margin'] as const) {
    const member = options[field];
    if (member !== undefined) result[field] = decodeInsets(member, `${owner} ${field}`);
  }
  return result;
}

function decodeLayoutAlignment(
  options: Readonly<Record<string, unknown>>,
  owner: string,
): Pick<LayoutFlowOptions, 'align' | 'justify' | 'overflow'> {
  const align = decodeLayoutEnum(options['align'], ['start', 'center', 'end', 'stretch'], `${owner} align`);
  const justify = decodeLayoutEnum(options['justify'], ['start', 'center', 'end', 'stretch'], `${owner} justify`);
  const overflow = decodeLayoutEnum(options['overflow'], ['clip', 'visible'], `${owner} overflow`);
  return {
    ...(align === undefined ? {} : { align }),
    ...(justify === undefined ? {} : { justify }),
    ...(overflow === undefined ? {} : { overflow }),
  };
}

function decodeLayoutEnum<const TValue extends string>(
  value: unknown,
  values: readonly TValue[],
  label: string,
): TValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !isLayoutEnumValue(value, values)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function isLayoutEnumValue<TValue extends string>(
  value: string,
  values: readonly TValue[],
): value is TValue {
  return values.some((candidate) => candidate === value);
}

function decodeInsets(value: unknown, label: string): LayoutInsetInput {
  if (typeof value === 'number') {
    return decodeLayoutCellCount(value, label);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-negative safe integer or inset object.`);
  }
  const insets = value as Readonly<Record<string, unknown>>;
  const result: { top?: number; right?: number; bottom?: number; left?: number } = {};
  for (const field of ['top', 'right', 'bottom', 'left'] as const) {
    const member = insets[field];
    if (member === undefined) continue;
    result[field] = decodeLayoutCellCount(member, `${label}.${field}`);
  }
  return Object.freeze(result);
}
