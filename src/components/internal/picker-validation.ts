import { sanitizeTerminalText } from '../../text/index.ts';

export function clean(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function nonEmpty(value: unknown, owner: string): string {
  const result = clean(value, owner);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${owner} must be non-empty.`);
  }
  return result;
}

export function nonNegativeInteger(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}

export function positiveInteger(value: unknown, owner: string): number | undefined {
  if (value === undefined) return undefined;
  const result = nonNegativeInteger(value, owner);
  if (result < 1) throw new RangeError(`${owner} must be positive.`);
  return result;
}
