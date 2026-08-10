import { findUnsupportedField, isNonArrayObject } from '../foundation/validation.ts';
import { isThemeColorToken } from './color.ts';
import type { TerminalColor, TerminalStyle } from './render.ts';

const terminalStyleFlagFields = [
  'bold',
  'dim',
  'italic',
  'underline',
  'strikethrough',
  'inverse',
  'hidden'
] as const satisfies readonly (keyof TerminalStyle)[];

const terminalStyleFields = new Set<string>(['fg', 'bg', ...terminalStyleFlagFields]);
const ansiColorFields = new Set(['kind', 'value']);
const rgbColorFields = new Set(['kind', 'r', 'g', 'b']);
const themeColorFields = new Set(['kind', 'token']);

type TerminalStyleFlagField = typeof terminalStyleFlagFields[number];
const normalizedTerminalStyles = new WeakMap<object, TerminalStyle>();

export function normalizeTerminalStyle(value: unknown, subject: string): TerminalStyle {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const existing = normalizedTerminalStyles.get(value);
  if (existing !== undefined) return existing;
  assertSupportedFields(value, terminalStyleFields, subject);
  const fg = ownValue(value, 'fg');
  const bg = ownValue(value, 'bg');
  const flags: Partial<Record<TerminalStyleFlagField, boolean>> = {};
  for (const field of terminalStyleFlagFields) {
    const flag = ownValue(value, field);
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') throw new TypeError(`${subject}.${field} must be a boolean.`);
    flags[field] = flag;
  }
  const normalized = Object.freeze({
    ...(fg === undefined ? {} : { fg: normalizeTerminalColor(fg, `${subject}.fg`) }),
    ...(bg === undefined ? {} : { bg: normalizeTerminalColor(bg, `${subject}.bg`) }),
    ...flags
  });
  normalizedTerminalStyles.set(normalized, normalized);
  if (Object.isFrozen(value)) normalizedTerminalStyles.set(value, normalized);
  return normalized;
}

function normalizeTerminalColor(value: unknown, subject: string): TerminalColor {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const kind = ownValue(value, 'kind');
  switch (kind) {
    case 'ansi': {
      assertSupportedFields(value, ansiColorFields, subject);
      const index = ownValue(value, 'value');
      if (!isColorChannel(index)) {
        throw new RangeError(`${subject}.value must be an integer from 0 through 255.`);
      }
      return Object.freeze({ kind, value: index });
    }
    case 'rgb': {
      assertSupportedFields(value, rgbColorFields, subject);
      const r = ownValue(value, 'r');
      const g = ownValue(value, 'g');
      const b = ownValue(value, 'b');
      if (!isColorChannel(r)) throw new RangeError(`${subject}.r must be an integer from 0 through 255.`);
      if (!isColorChannel(g)) throw new RangeError(`${subject}.g must be an integer from 0 through 255.`);
      if (!isColorChannel(b)) throw new RangeError(`${subject}.b must be an integer from 0 through 255.`);
      return Object.freeze({ kind, r, g, b });
    }
    case 'theme': {
      assertSupportedFields(value, themeColorFields, subject);
      const token = ownValue(value, 'token');
      if (typeof token !== 'string' || !isThemeColorToken(token)) {
        throw new TypeError(`${subject}.token must be a supported theme color token.`);
      }
      return Object.freeze({ kind, token });
    }
    default:
      throw new TypeError(`${subject}.kind must be "ansi", "rgb", or "theme".`);
  }
}

function assertSupportedFields(
  value: Readonly<Record<string, unknown>>,
  supported: ReadonlySet<string>,
  subject: string
): void {
  const field = findUnsupportedField(value, supported);
  if (field !== undefined) throw new TypeError(`${subject} contains unsupported field "${field}".`);
}

function ownValue(value: Readonly<Record<string, unknown>>, field: string): unknown {
  return Object.hasOwn(value, field) ? value[field] : undefined;
}

function isColorChannel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}
