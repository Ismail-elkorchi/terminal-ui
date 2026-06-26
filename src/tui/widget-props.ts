import type { Widget } from '../widgets/index.ts';

export function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'text' in value) {
    const maybeText = (value as { readonly text?: unknown }).text;
    if (typeof maybeText === 'string') return maybeText;
  }
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol') return value.description ?? 'symbol';
  if (typeof value === 'function') return Object.prototype.toString.call(value);
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function numberProp(widget: Widget, key: string): number | undefined {
  const value = widget.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
