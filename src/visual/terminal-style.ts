import { findUnsupportedField, isNonArrayObject } from '../foundation/validation.ts';
import { isThemeColorToken } from './color.ts';
import type { TerminalColor, TerminalStyle } from './render-content.ts';

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
const defaultColorFields = new Set(['kind']);
const rgbColorFields = new Set(['kind', 'r', 'g', 'b']);
const themeColorFields = new Set(['kind', 'token']);

type TerminalStyleFlagField = typeof terminalStyleFlagFields[number];
const normalizedTerminalStyles = new WeakMap<object, TerminalStyle>();
const canonicalTerminalStyles = new Map<string, TerminalStyle>();
const maximumCanonicalTerminalStyles = 4_096;
const maximumCanonicalTerminalStyleKeyLength = 1_024;
const maximumCanonicalTerminalStyleWeight = 262_144;
let canonicalTerminalStyleWeight = 0;

export function decodeTerminalStyle(value: unknown, subject = 'terminal style'): TerminalStyle {
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
  const candidate = {
    ...(fg === undefined ? {} : { fg: decodeTerminalColor(fg, `${subject}.fg`) }),
    ...(bg === undefined ? {} : { bg: decodeTerminalColor(bg, `${subject}.bg`) }),
    ...flags
  };
  const key = terminalStyleKey(candidate);
  const normalized = canonicalTerminalStyles.get(key) ?? Object.freeze(candidate);
  if (!canonicalTerminalStyles.has(key) && key.length <= maximumCanonicalTerminalStyleKeyLength) {
    canonicalTerminalStyles.set(key, normalized);
    canonicalTerminalStyleWeight += key.length;
    while (
      canonicalTerminalStyles.size > maximumCanonicalTerminalStyles
      || canonicalTerminalStyleWeight > maximumCanonicalTerminalStyleWeight
    ) {
      const oldest = canonicalTerminalStyles.keys().next().value;
      if (oldest === undefined) break;
      canonicalTerminalStyles.delete(oldest);
      canonicalTerminalStyleWeight -= oldest.length;
    }
  }
  normalizedTerminalStyles.set(normalized, normalized);
  if (Object.isFrozen(value)) normalizedTerminalStyles.set(value, normalized);
  return normalized;
}

function decodeTerminalColor(value: unknown, subject: string): TerminalColor {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const kind = ownValue(value, 'kind');
  switch (kind) {
    case 'default':
      assertSupportedFields(value, defaultColorFields, subject);
      return Object.freeze({ kind });
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
      throw new TypeError(`${subject}.kind must be "default", "ansi", "rgb", or "theme".`);
  }
}

/** Returns an owned, immutable, right-biased composition of terminal styles. */
export function mergeTerminalStyles(
  ...values: readonly (TerminalStyle | undefined)[]
): TerminalStyle | undefined {
  const merged = values.reduce<Record<string, unknown>>(
    (current, value) => value === undefined ? current : { ...current, ...value },
    {},
  );
  return Object.keys(merged).length === 0
    ? undefined
    : decodeTerminalStyle(merged, 'Terminal style composition');
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

function terminalStyleKey(style: TerminalStyle): string {
  return JSON.stringify([
    terminalColorKey(style.fg),
    terminalColorKey(style.bg),
    style.bold ?? null,
    style.dim ?? null,
    style.italic ?? null,
    style.underline ?? null,
    style.strikethrough ?? null,
    style.inverse ?? null,
    style.hidden ?? null,
  ]);
}

function terminalColorKey(color: TerminalColor | undefined): unknown {
  if (color === undefined) return null;
  switch (color.kind) {
    case 'default': return ['default'];
    case 'ansi': return ['ansi', color.value];
    case 'rgb': return ['rgb', color.r, color.g, color.b];
    case 'theme': return ['theme', color.token];
  }
}
