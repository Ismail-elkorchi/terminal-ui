import type { TerminalGraphicsMode } from './types.ts';

export function decodeTerminalGraphicsMode(value: unknown): TerminalGraphicsMode {
  if (value === undefined) return 'none';
  if (value === 'auto' || value === 'kitty' || value === 'sixel' || value === 'none') return value;
  throw new TypeError("Terminal graphics mode must be 'auto', 'kitty', 'sixel', or 'none'.");
}
