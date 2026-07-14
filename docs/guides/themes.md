# Themes

Themes are named design-token collections. A `TerminalTheme` contains
`tokens.colors` and `tokens.symbols`, plus a stable fingerprint used by render
and runtime caches. Structural layout and component density remain explicit
authoring contracts; changing a theme does not reflow the application.

The built-in presets are:

- `minimalTheme`
- `modernTheme`
- `highContrastTheme`
- `noColorTheme`

Optional theme packs are exported as named themes: Catppuccin, Nord, Tokyo
Night, Solarized, Gruvbox, Dracula, and Monochrome. They are ordinary
`TerminalTheme` values; applications choose them explicitly instead of the
runtime hardwiring a product identity.

Use `defineTheme()` to start from a preset-like shape and override only the
tokens your UI needs through the `tokens` field. Built-in components use core
semantic color tokens such as
`text.default`, `accent.primary`, `status.error`, `selection.background`,
`table.header`, and `chart.series.1`. Applications may add custom namespaced
tokens; missing custom tokens fall back through `text.default` when styles are
resolved.

```ts
import { defineTheme } from '@ismail-elkorchi/terminal-ui/theme';

const theme = defineTheme({
  name: 'workspace',
  tokens: {
    colors: {
      'accent.primary': { kind: 'rgb', r: 0, g: 255, b: 136 },
      'custom.panel.border': { kind: 'ansi', value: 8 }
    },
    symbols: {
      pointer: '›'
    }
  }
});

void theme;
```

Symbols are separate from colors. Use `asciiSymbols` for ASCII-only terminals
and `unicodeSymbols` for richer terminals. Components consume theme symbols
instead of hard-coded glyph choices wherever the symbol has semantic meaning.

Theme output is resolved by the render serializer, not by component factories.
Renderers emit semantic style data; serializers decide how that style maps to
the current terminal capability.

Component factories accept local `meta.styles` for semantic slots such as
`root`, `border`, `title`, `label`, `value`, `placeholder`, `selected`,
`focused`, `disabled`, `error`, `warning`, and `success`. These slots layer
over theme defaults for that component only; they do not create a global
cascade.

For renderer-facing style behavior, see
[Rendering internals](./rendering-internals.md). For state and slot guidance,
see [Building polished components](./building-polished-components.md).

Executable example:

- `examples/testing/harness.mjs`
