import { sanitizeTerminalText } from '../text/index.ts';
import type { ProgressState } from './types.ts';

export function progressDisplayLine(progress: ProgressState): string {
  const label = progress.label.length === 0 ? 'Progress' : progress.label;
  const bar = progress.kind === 'indeterminate'
    ? '[----------]'
    : progressBar(progress.value, progress.max);
  const value = progress.kind === 'indeterminate'
    ? ''
    : ` ${String(progress.value)}/${String(progress.max)}`;
  const status = progress.status === undefined ? '' : ` ${progress.status}`;
  return sanitizeTerminalText(`${label} ${bar}${value}${status}`).text;
}

function progressBar(value: number, max: number): string {
  const effectiveMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(effectiveMax, value));
  const filled = Math.round((clamped / effectiveMax) * 10);
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
}
