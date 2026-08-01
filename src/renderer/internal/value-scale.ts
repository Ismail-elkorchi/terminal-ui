import { sanitizeTerminalText } from '../../text/index.ts';
import { isThemeColorToken } from '../../theme/index.ts';
import type { ValueScaleStop } from '../../ui-model/feedback.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import { mergeStyles } from '../style-resolution.ts';

interface ValueDomain {
  readonly min: number;
  readonly max: number;
}

const scaleStopLimit = 32;

export function normalizeValueScale(value: unknown): readonly ValueScaleStop[] {
  if (!Array.isArray(value)) return [];
  const stops = value.flatMap((item): readonly ValueScaleStop[] => {
    if (typeof item !== 'object' || item === null) return [];
    const at = (item as { readonly at?: unknown }).at;
    const token = (item as { readonly token?: unknown }).token;
    if (typeof at !== 'number' || !Number.isFinite(at)) return [];
    if (typeof token !== 'string' || !isThemeColorToken(token)) return [];
    const label = (item as { readonly label?: unknown }).label;
    const cleanedLabel = typeof label === 'string' ? sanitizeTerminalText(label).text.trim() : '';
    return [{
      at: clamp01(at),
      token,
      ...(cleanedLabel.length === 0 ? {} : { label: cleanedLabel })
    }];
  });
  return [...stops]
    .sort((left, right) => left.at - right.at)
    .slice(0, scaleStopLimit);
}

export function valueScaleStyle(
  value: number,
  domain: ValueDomain,
  scale: readonly ValueScaleStop[],
  base?: TerminalStyle
): TerminalStyle | undefined {
  const stop = valueScaleStop(value, domain, scale);
  if (stop === undefined) return base;
  return mergeStyles(base, {
    fg: { kind: 'theme', token: stop.token },
    bold: true
  });
}

export function valueScaleStop(
  value: number,
  domain: ValueDomain,
  scale: readonly ValueScaleStop[]
): ValueScaleStop | undefined {
  if (scale.length === 0 || !Number.isFinite(value)) return undefined;
  const ratio = normalizedRatio(value, domain);
  let selected = scale[0];
  for (const stop of scale) {
    if (ratio < stop.at) break;
    selected = stop;
  }
  return selected;
}

export function normalizedRatio(value: number, domain: ValueDomain): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max)) return 0;
  if (domain.max <= domain.min) return 0;
  return clamp01((value - domain.min) / (domain.max - domain.min));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
