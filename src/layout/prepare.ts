import type { LayoutFlowOptions, LayoutInsetInput } from '../geometry/types.ts';

/** Validates and detaches layout fields retained by a layout or component. */
export function normalizeLayoutFlowOptions(
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
  for (const field of ['padding', 'margin'] as const) {
    const member = options[field];
    if (member === undefined) continue;
    result[field] = prepareInsets(member, `${owner} ${field}`);
  }
  const align = options['align'];
  if (align !== undefined && align !== 'start' && align !== 'center' && align !== 'end' && align !== 'stretch') {
    throw new TypeError(`${owner} align is invalid.`);
  }
  if (align !== undefined) result.align = align;
  const justify = options['justify'];
  if (justify !== undefined
    && justify !== 'start'
    && justify !== 'center'
    && justify !== 'end'
    && justify !== 'stretch') {
    throw new TypeError(`${owner} justify is invalid.`);
  }
  if (justify !== undefined) result.justify = justify;
  const overflow = options['overflow'];
  if (overflow !== undefined && overflow !== 'clip' && overflow !== 'visible') {
    throw new TypeError(`${owner} overflow is invalid.`);
  }
  if (overflow !== undefined) result.overflow = overflow;
  return result;
}

function prepareInsets(value: unknown, label: string): LayoutInsetInput {
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
