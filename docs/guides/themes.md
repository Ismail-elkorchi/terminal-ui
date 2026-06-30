# Themes

Themes map semantic tokens to terminal colors, symbols, and spacing.

The built-in presets are:

- `minimalTheme`
- `modernTheme`
- `compactTheme`
- `highContrastTheme`
- `noColorTheme`

Optional theme packs are exported as named themes: Catppuccin, Nord, Tokyo
Night, Solarized, Gruvbox, Dracula, and Monochrome. They are ordinary
`TerminalTheme` values; applications choose them explicitly instead of the
runtime hardwiring a product identity.

Use `defineTheme()` to start from a preset-like shape and override only the
tokens your UI needs. Built-in widgets use core semantic tokens such as
`text.default`, `accent.primary`, `status.error`, `selection.background`,
`table.header`, and `chart.series.1`. Applications may add custom namespaced
tokens; missing custom tokens fall back through `text.default` when styles are
resolved.

Symbols are separate from colors. Use `asciiSymbols` for ASCII-only terminals
and `unicodeSymbols` for richer terminals. Widgets consume theme symbols
instead of hard-coded glyph choices wherever the symbol has semantic meaning.

Theme output is resolved by the render serializer, not by widgets. Widgets emit
semantic style data; renderers and serializers decide how that style maps to the
current terminal capability.

Widget factories accept local `styles` for semantic slots such as `root`,
`border`, `title`, `label`, `value`, `placeholder`, `selected`, `focused`,
`disabled`, `error`, `warning`, and `success`. These slots layer over theme
defaults for that widget only; they do not create a global cascade.

For renderer-facing style behavior, see
[Rendering internals](./rendering-internals.md). For state and slot guidance,
see [Building polished widgets](./building-polished-widgets.md).

Executable examples:

- `examples/showcase/app.mjs`
- `examples/showcase/scripted.mjs`
- `examples/testing/visual-snapshots.mjs`
- `examples/products/chart-explorer.mjs`
