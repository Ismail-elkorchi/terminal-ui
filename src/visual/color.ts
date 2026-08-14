const coreColorTokenValues = [
  'app.background',
  'app.foreground',
  'surface.background',
  'surface.border',
  'surface.title',
  'surface.bar.background',
  'surface.bar.border',
  'surface.raised.background',
  'surface.raised.border',
  'surface.inset.background',
  'surface.inset.border',
  'surface.selected.background',
  'surface.selected.border',
  'surface.warning.background',
  'surface.warning.border',
  'surface.danger.background',
  'surface.danger.border',
  'surface.success.background',
  'surface.success.border',
  'surface.backdrop',
  'surface.shadow',
  'text.default',
  'text.muted',
  'text.strong',
  'text.disabled',
  'link.foreground',
  'accent.primary',
  'status.info',
  'status.success',
  'status.warning',
  'status.error',
  'status.pending',
  'status.running',
  'scale.low',
  'scale.medium',
  'scale.high',
  'scale.critical',
  'selection.background',
  'selection.foreground',
  'focus.border',
  'focus.background',
  'control.background',
  'control.foreground',
  'control.border',
  'control.primary.background',
  'control.primary.foreground',
  'control.primary.border',
  'control.secondary.background',
  'control.secondary.foreground',
  'control.secondary.border',
  'control.track',
  'control.track.filled',
  'control.handle',
  'control.toggle.on.background',
  'control.toggle.off.background',
  'input.cursor',
  'input.placeholder',
  'editor.gutter.foreground',
  'editor.gutter.background',
  'editor.gutter.active.foreground',
  'editor.activeLine.background',
  'command.prompt',
  'command.match',
  'menu.match',
  'menu.selected',
  'tab.active.foreground',
  'tab.inactive.foreground',
  'tab.indicator',
  'badge.background',
  'badge.foreground',
  'keyHint.background',
  'keyHint.foreground',
  'table.header',
  'table.metric',
  'table.metadata',
  'tree.branch',
  'log.info',
  'log.metadata',
  'log.warning',
  'log.error',
  'log.timestamp',
  'scrollbar.track',
  'scrollbar.thumb',
  'chart.axis',
  'chart.label',
  'chart.value',
  'chart.muted',
  'chart.baseline',
  'chart.positive',
  'chart.negative',
  'chart.series.1',
  'chart.series.2',
  'chart.series.3'
] as const;

export type CoreColorToken = typeof coreColorTokenValues[number];
export const coreColorTokens: readonly CoreColorToken[] = Object.freeze(coreColorTokenValues);
export type CustomColorToken = `custom.${string}`;
export type ThemeColorToken = CoreColorToken | CustomColorToken;

export interface ThemeColorReference {
  readonly kind: 'theme';
  readonly token: ThemeColorToken;
}

const coreColorTokenSet = new Set<string>(coreColorTokens);

export function isThemeColorToken(value: unknown): value is ThemeColorToken {
  return typeof value === 'string'
    && (coreColorTokenSet.has(value) || value.startsWith('custom.') && value.length > 'custom.'.length);
}

export function themeColor(token: ThemeColorToken): ThemeColorReference;
export function themeColor(token: unknown): ThemeColorReference {
  if (!isThemeColorToken(token)) {
    throw new TypeError('Theme color token must be a core token or use the custom.* namespace.');
  }
  return Object.freeze({ kind: 'theme', token });
}

export type ThemeColor =
  | { readonly kind: 'ansi'; readonly value: number }
  | { readonly kind: 'rgb'; readonly r: number; readonly g: number; readonly b: number };
