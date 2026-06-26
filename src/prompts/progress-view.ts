import { sanitizeTerminalText } from '../text/index.ts';
import type { ProgressState } from './types.ts';

export function progressDisplayLine(progress: ProgressState): string {
  const label = progress.label.length === 0 ? 'Progress' : progress.label;
  const bar = progress.indeterminate || progress.value === undefined
    ? '[----------]'
    : progressBar(progress.value, progress.max ?? 100);
  const value = progress.indeterminate || progress.value === undefined
    ? ''
    : ` ${String(progress.value)}/${String(progress.max ?? 100)}`;
  const status = progress.status === undefined ? '' : ` ${progress.status}`;
  return sanitizeTerminalText(`${label} ${bar}${value}${status}`).text;
}

function progressBar(value: number, max: number): string {
  const effectiveMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(effectiveMax, value));
  const filled = Math.round((clamped / effectiveMax) * 10);
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
}
