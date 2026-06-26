import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { suggestionsForSource } from './adapter.ts';
import type { CommandPalette, CommandPaletteOptions } from './types.ts';

export function createCommandPalette(options: CommandPaletteOptions): CommandPalette {
  return {
    id: options.id ?? 'command-palette',
    source: options.commands,
    snapshot() {
      const suggestions = suggestionsForSource(options.commands);
      return toAccessibleSnapshot({
        source: 'shell',
        root: {
          id: options.id ?? 'command-palette',
          role: 'menu',
          label: options.title ?? 'Command palette',
          children: suggestions.map((suggestion) => ({
            id: `${options.id ?? 'command-palette'}:${suggestion.id}`,
            role: 'menuitem',
            label: suggestion.label,
            ...(suggestion.description === undefined ? {} : { description: suggestion.description })
          }))
        }
      });
    }
  };
}
