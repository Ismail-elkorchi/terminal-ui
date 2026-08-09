import { isNonArrayObject } from '../foundation/validation.ts';
import type { LayoutFlowOptions, LayoutInsetInput } from '../geometry/types.ts';

/** Validates and detaches the layout fields of a dynamic component model. */
export function prepareLayoutFlowOptions(
  value: Readonly<Record<string, unknown>>,
  owner: string
): LayoutFlowOptions {
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
    const member = value[field];
    if (member === undefined) continue;
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${owner} ${field} must be a non-negative safe integer.`);
    }
    result[field] = member;
  }
  for (const field of ['padding', 'margin'] as const) {
    const member = value[field];
    if (member === undefined) continue;
    result[field] = prepareInsets(member, `${owner} ${field}`);
  }
  const align = value['align'];
  if (align !== undefined && align !== 'start' && align !== 'center' && align !== 'end' && align !== 'stretch') {
    throw new TypeError(`${owner} align is invalid.`);
  }
  if (align !== undefined) result.align = align;
  const justify = value['justify'];
  if (justify !== undefined
    && justify !== 'start'
    && justify !== 'center'
    && justify !== 'end'
    && justify !== 'stretch') {
    throw new TypeError(`${owner} justify is invalid.`);
  }
  if (justify !== undefined) result.justify = justify;
  const overflow = value['overflow'];
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
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${label} must be a non-negative safe integer or inset object.`);
  }
  const unsupported = Object.keys(value).find((field) =>
    field !== 'top' && field !== 'right' && field !== 'bottom' && field !== 'left'
  );
  if (unsupported !== undefined) throw new TypeError(`${label} contains unknown field "${unsupported}".`);
  const result: { top?: number; right?: number; bottom?: number; left?: number } = {};
  for (const field of ['top', 'right', 'bottom', 'left'] as const) {
    const member = value[field];
    if (member === undefined) continue;
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${label}.${field} must be a non-negative safe integer.`);
    }
    result[field] = member;
  }
  return result;
}
