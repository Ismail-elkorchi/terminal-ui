import type { LayoutFlowOptions, LayoutInsetInput } from '../geometry/types.ts';

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
  return result;
}

function decodeLayoutDimensions(
  options: Readonly<Record<string, unknown>>,
  owner: string,
): Pick<LayoutFlowOptions, 'gap' | 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight'> {
  const result: { gap?: number; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number } = {};
  for (const field of ['gap', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const) {
    const member = options[field];
    if (member === undefined) continue;
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${owner} ${field} must be a non-negative safe integer.`);
    }
    result[field] = member;
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
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer or inset object.`);
    }
    return value;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-negative safe integer or inset object.`);
  }
  const insets = value as Readonly<Record<string, unknown>>;
  const result: { top?: number; right?: number; bottom?: number; left?: number } = {};
  for (const field of ['top', 'right', 'bottom', 'left'] as const) {
    const member = insets[field];
    if (member === undefined) continue;
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${label}.${field} must be a non-negative safe integer.`);
    }
    result[field] = member;
  }
  return result;
}
