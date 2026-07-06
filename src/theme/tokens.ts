import type { TerminalSymbols, TerminalSymbolsDefinition } from './symbols.ts';

export type CoreColorToken =
  | 'app.background'
  | 'app.foreground'
  | 'surface.background'
  | 'surface.foreground'
  | 'surface.border'
  | 'surface.title'
  | 'surface.chrome.background'
  | 'surface.chrome.border'
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
  | 'text.strong'
  | 'text.disabled'
  | 'link.foreground'
  | 'accent.primary'
  | 'accent.secondary'
  | 'status.info'
  | 'status.success'
  | 'status.warning'
  | 'status.error'
  | 'status.pending'
  | 'status.running'
  | 'selection.background'
  | 'selection.foreground'
  | 'focus.border'
  | 'focus.background'
  | 'control.background'
  | 'control.foreground'
  | 'control.border'
  | 'control.primary.background'
  | 'control.primary.foreground'
  | 'control.primary.border'
  | 'control.secondary.background'
  | 'control.secondary.foreground'
  | 'control.secondary.border'
  | 'control.track'
  | 'control.track.filled'
  | 'control.handle'
  | 'control.toggle.on.background'
  | 'control.toggle.off.background'
  | 'input.cursor'
  | 'input.placeholder'
  | 'command.prompt'
  | 'command.match'
  | 'menu.match'
  | 'menu.selected'
  | 'tab.active.foreground'
  | 'tab.inactive.foreground'
  | 'tab.indicator'
  | 'badge.background'
  | 'badge.foreground'
  | 'keyHint.background'
  | 'keyHint.foreground'
  | 'table.header'
  | 'tree.branch'
  | 'log.info'
  | 'log.warning'
  | 'log.error'
  | 'scrollbar.track'
  | 'scrollbar.thumb'
  | 'diff.add'
  | 'diff.remove'
  | 'diff.context'
  | 'chart.series.1'
  | 'chart.series.2'
  | 'chart.series.3';

export type ThemeColorToken = CoreColorToken | (string & {});

export type ThemeColor =
  | { readonly kind: 'ansi'; readonly value: number }
  | { readonly kind: 'rgb'; readonly r: number; readonly g: number; readonly b: number };

export type ThemeColorTokens = Readonly<Record<string, ThemeColor>>;

export interface TerminalSpacingTokens {
  readonly gap: number;
  readonly padding: number;
}

export interface TerminalDesignTokens {
  readonly colors: ThemeColorTokens;
  readonly symbols: TerminalSymbols;
  readonly spacing: TerminalSpacingTokens;
}

export interface TerminalDesignTokenDefinition {
  readonly colors?: Readonly<Partial<Record<ThemeColorToken, ThemeColor>>> | ThemeColorTokens;
  readonly symbols?: TerminalSymbolsDefinition;
  readonly spacing?: Partial<TerminalSpacingTokens>;
}
