# Themes

Themes map semantic tokens to terminal colors, symbols, and spacing.

The built-in presets are:

- `minimalTheme`
- `modernTheme`
- `compactTheme`
- `highContrastTheme`
- `noColorTheme`

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

Executable examples:

- `examples/tui/forms-settings.mjs`
- `examples/tui/monitoring-console.mjs`
- `examples/testing/visual-snapshots.mjs`
