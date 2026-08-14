import { ensureContrast } from '../contrast.ts';
import type { TerminalThemeDefinition } from '../theme.ts';
import type { CoreColorToken, ThemeColor } from '../tokens.ts';

type ThemePackSeedToken =
  | 'app.background'
  | 'app.foreground'
  | 'surface.background'
  | 'surface.border'
  | 'surface.title'
  | 'surface.bar.background'
  | 'surface.bar.border'
  | 'surface.raised.background'
  | 'surface.raised.border'
  | 'surface.inset.background'
  | 'surface.inset.border'
  | 'surface.selected.background'
  | 'surface.selected.border'
  | 'surface.warning.background'
  | 'surface.warning.border'
  | 'surface.danger.background'
  | 'surface.danger.border'
  | 'surface.success.background'
  | 'surface.success.border'
  | 'surface.shadow'
  | 'text.default'
  | 'text.muted'
  | 'accent.primary'
  | 'status.info'
  | 'status.success'
  | 'status.warning'
  | 'status.error'
  | 'selection.background'
  | 'focus.border'
  | 'menu.match'
  | 'chart.series.1'
  | 'chart.series.2'
  | 'chart.series.3';

export type SemanticPaletteSeed = Readonly<Record<ThemePackSeedToken, ThemeColor>>
  & Readonly<Partial<Record<CoreColorToken, ThemeColor>>>;

export function rgb(r: number, g: number, b: number): ThemeColor {
  return { kind: 'rgb', r, g, b };
}

export function themePackDefinition(name: string, seed: SemanticPaletteSeed): TerminalThemeDefinition {
  return { name, tokens: { colors: completeSemanticColors(seed) } };
}

export function completeSemanticColors(seed: SemanticPaletteSeed): Readonly<Record<CoreColorToken, ThemeColor>> {
  const app = seed['app.background'];
  const surface = seed['surface.background'];
  const bar = seed['surface.bar.background'];
  const raised = seed['surface.raised.background'];
  const inset = seed['surface.inset.background'];
  const selected = seed['surface.selected.background'];
  const text = readable(seed['text.default'], surface);
  const muted = readable(seed['text.muted'], surface);
  const strong = readable(seed['text.strong'] ?? seed['app.foreground'], surface);
  const accent = seed['accent.primary'];
  const info = readable(seed['status.info'], surface);
  const success = readable(seed['status.success'], surface);
  const warning = readable(seed['status.warning'], surface);
  const error = readable(seed['status.error'], surface);
  const series1 = visible(seed['chart.series.1'], surface);
  const series2 = visible(seed['chart.series.2'], surface);
  const series3 = visible(seed['chart.series.3'], surface);
  const colors = {
    'app.background': app,
    'app.foreground': readable(seed['app.foreground'], app),
    'surface.background': surface,
    'surface.border': visible(seed['surface.border'], surface),
    'surface.title': readable(seed['surface.title'], surface),
    'surface.bar.background': bar,
    'surface.bar.border': visible(seed['surface.bar.border'], bar),
    'surface.raised.background': raised,
    'surface.raised.border': visible(seed['surface.raised.border'], raised),
    'surface.inset.background': inset,
    'surface.inset.border': visible(seed['surface.inset.border'], inset),
    'surface.selected.background': selected,
    'surface.selected.border': visible(seed['surface.selected.border'], selected),
    'surface.warning.background': seed['surface.warning.background'],
    'surface.warning.border': visible(seed['surface.warning.border'], seed['surface.warning.background']),
    'surface.danger.background': seed['surface.danger.background'],
    'surface.danger.border': visible(seed['surface.danger.border'], seed['surface.danger.background']),
    'surface.success.background': seed['surface.success.background'],
    'surface.success.border': visible(seed['surface.success.border'], seed['surface.success.background']),
    'surface.backdrop': app,
    'surface.shadow': seed['surface.shadow'],
    'text.default': text,
    'text.muted': muted,
    'text.strong': strong,
    'text.disabled': muted,
    'link.foreground': readable(seed['status.info'], surface),
    'accent.primary': accent,
    'status.info': info,
    'status.success': success,
    'status.warning': warning,
    'status.error': error,
    'status.pending': muted,
    'status.running': info,
    'scale.low': success,
    'scale.medium': warning,
    'scale.high': warning,
    'scale.critical': error,
    'selection.background': selected,
    'selection.foreground': readable(seed['selection.foreground'] ?? text, selected),
    'focus.border': visible(seed['focus.border'], surface),
    'focus.background': seed['focus.background'] ?? selected,
    'control.background': raised,
    'control.foreground': readable(text, raised),
    'control.border': visible(seed['surface.raised.border'], raised),
    'control.primary.background': accent,
    'control.primary.foreground': ensureContrast(text, accent, 4.5),
    'control.primary.border': visible(seed['focus.border'], accent),
    'control.secondary.background': selected,
    'control.secondary.foreground': readable(text, selected),
    'control.secondary.border': visible(seed['surface.selected.border'], selected),
    'control.track': visible(seed['surface.border'], surface),
    'control.track.filled': visible(accent, visible(seed['surface.border'], surface)),
    'control.handle': strong,
    'control.toggle.on.background': seed['status.success'],
    'control.toggle.off.background': seed['surface.border'],
    'input.cursor': readable(seed['focus.border'], surface),
    'input.placeholder': muted,
    'editor.gutter.foreground': readable(seed['text.muted'], inset),
    'editor.gutter.background': inset,
    'editor.gutter.active.foreground': readable(seed['status.info'], inset),
    'editor.activeLine.background': selected,
    'command.prompt': info,
    'command.match': readable(seed['menu.match'], surface),
    'menu.match': readable(seed['menu.match'], surface),
    'menu.selected': readable(seed['menu.selected'] ?? accent, selected),
    'tab.active.foreground': strong,
    'tab.inactive.foreground': muted,
    'tab.indicator': visible(accent, surface),
    'badge.background': accent,
    'badge.foreground': ensureContrast(text, accent, 4.5),
    'keyHint.background': inset,
    'keyHint.foreground': readable(strong, inset),
    'table.header': strong,
    'table.metric': text,
    'table.metadata': muted,
    'tree.branch': visible(seed['text.muted'], surface),
    'log.info': info,
    'log.metadata': muted,
    'log.warning': warning,
    'log.error': error,
    'log.timestamp': info,
    'scrollbar.track': visible(seed['surface.border'], surface),
    'scrollbar.thumb': visible(seed['text.muted'], visible(seed['surface.border'], surface)),
    'chart.axis': visible(seed['surface.border'], surface),
    'chart.label': text,
    'chart.value': strong,
    'chart.muted': visible(seed['text.muted'], surface),
    'chart.baseline': visible(seed['surface.border'], surface),
    'chart.positive': series1,
    'chart.negative': series2,
    'chart.series.1': series1,
    'chart.series.2': series2,
    'chart.series.3': series3
  } satisfies Readonly<Record<CoreColorToken, ThemeColor>>;
  return colors;
}

function readable(foreground: ThemeColor, background: ThemeColor): ThemeColor {
  return ensureContrast(foreground, background, 4.5);
}

function visible(foreground: ThemeColor, background: ThemeColor): ThemeColor {
  return ensureContrast(foreground, background, 3);
}
