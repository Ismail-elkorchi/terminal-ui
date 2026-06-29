import type { RenderSpan, TerminalStyle } from '../render-primitives.ts';

export type BlockGlyph =
  | 'full'
  | 'upper'
  | 'lower'
  | 'left'
  | 'right'
  | 'light'
  | 'medium'
  | 'dark';

const BLOCK_GLYPHS: Record<BlockGlyph, string> = {
  full: '█',
  upper: '▀',
  lower: '▄',
  left: '▌',
  right: '▐',
  light: '░',
  medium: '▒',
  dark: '▓'
};

export function blockGlyph(glyph: BlockGlyph): string {
  return BLOCK_GLYPHS[glyph];
}

export function blockSpan(glyph: BlockGlyph, style?: TerminalStyle): RenderSpan {
  return {
    text: blockGlyph(glyph),
    ...(style === undefined ? {} : { style })
  };
}
