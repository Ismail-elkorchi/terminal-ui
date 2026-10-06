# Themes

Themes are canonical, immutable collections of semantic colors and symbols. A
`TerminalThemeDefinition` is a partial input; `defineTheme()` merges it onto a
canonical base and returns a `TerminalTheme`. Renderers and prompts recognize
canonical themes directly instead of interpreting them again as partial
definitions.

The built-in themes are:

- `defaultTheme`, the complete graphical default;
- `minimalTheme`, which preserves the terminal foreground and background while
  retaining a small ANSI accent vocabulary;
- `highContrastTheme`;
- `noColorTheme`.

They are also available through the immutable `builtInThemes` registry. TUI and
renderer APIs default to `defaultTheme`; prompts default to `minimalTheme` for a
restrained command-line appearance.

Named palette packs live in a separate entrypoint, so applications that do not
use them do not initialize them:

```ts
import {
  catppuccinMochaTheme,
  draculaTheme,
  gruvboxDarkTheme,
  monochromeTheme,
  nordTheme,
  solarizedDarkTheme,
  tokyoNightTheme
} from '@ismail-elkorchi/terminal-ui/theme/packs';
```

Each pack supplies a complete semantic palette derived only from its own seed
colors. It does not inherit unrelated values from the default theme.

Use `defineTheme()` for an application theme or a small override:

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

Core tokens describe component behavior such as `text.default`,
`status.error`, `selection.background`, `table.header`, and
`chart.series.1`. Custom tokens must use the `custom.*` namespace. An
unresolved token preserves the terminal's current color; it never falls back
implicitly to a foreground token. If an application needs fallback, it should
choose the semantically appropriate token before constructing the style.

Renderer-facing code can construct a semantic color reference without
repeating its representation:

```ts
import { themeColor } from '@ismail-elkorchi/terminal-ui/theme';

const style = { fg: themeColor('custom.panel.border'), bold: true };
```

Symbols are separate from colors. Changing `mode` selects the complete ASCII
or Unicode repertoire before explicit symbol overrides are applied, so an
ASCII theme cannot retain unspecified Unicode glyphs. Symbol changes can alter
measurement and reflow content because equivalent ASCII and Unicode symbols
may have different cell widths.

Theme colors remain semantic through layout and frame construction. The
serializer resolves them for the terminal's color depth. Theme data is copied
and frozen at construction, and render reuse compares exact canonical color
and symbol content; a theme's display name is not rendering identity.

Component `styles` customize the component's declared anatomy and visual states
locally. They layer over that component's theme defaults and do not create a
global cascade.

## Inheriting painted backgrounds

`TerminalStyle.bg` accepts either a color or `null`. Omitting `bg` leaves an
earlier background unchanged during style composition. Setting `bg: null`
explicitly clears that earlier background, including a component's theme
background, and asks the frame buffer to use the destination cell's background
when painting. The policy survives root, part, and visual-state style merging;
a later explicit color overrides it. It does not change foregrounds, text,
attributes, layout, input behavior, or accessibility.

For a native text input, clear the ordinary parts that should show the backing
surface. Keep focus and selection cues independently styled:

```ts
import { textInput } from '@ismail-elkorchi/terminal-ui/components';
import { ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';

const editor = textInput({
  id: 'editor',
  state: { text: 'Across two background colors', cursor: 0 },
  onTransition: () => ignoreMessage(),
  styles: {
    parts: {
      border: { bg: null },
      value: { bg: null },
      placeholder: { bg: null }
    },
    states: {
      focused: {
        parts: { border: { bg: { kind: 'theme', token: 'focus.background' } } }
      },
      selected: {
        parts: { selection: { bg: { kind: 'theme', token: 'selection.background' } } }
      }
    }
  }
});

void editor;
```

Each painted cell inherits its own destination background, so the input can span
differently colored cells without flattening them to one color. A wide glyph
uses its leading cell's background for its continuation cells. Ordinary
padding still writes spaces. `null` is a style policy, not a theme palette color:
use it on `styles`, not in `tokens.colors`. A root-level override applies to every
part, so prefer ordinary-part overrides when a component's selection or other
semantic parts need their own backgrounds.

A separately promoted layer or portal must also choose
`meta: { layer: { underlay: 'inheritBackground' } }` when it needs backgrounds
from a lower region. The style override does not change region underlay rules.
`{ kind: 'default' }` requests the terminal's default background; it does not
inherit the color of a destination cell.

For renderer-facing behavior, see
[Rendering internals](./rendering-internals.md). For state and slot guidance,
see [Component definitions](./component-definitions.md).

See the executable [testing harness example](../../examples/testing/harness.mjs)
for a rendered theme snapshot.
