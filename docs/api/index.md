# API Overview

The complete generated export graph is in the [API reference](./reference.md).

`terminal-ui` publishes one root entrypoint and focused subpath entrypoints.
The root entrypoint exposes the main vertical path:

- `createTerminalHost()`, `defineTui()`, and `runTui()`
- `intervalSource()`, `timeoutSource()`, and `animationSource()` for app
  subscriptions
- typed component factories such as `textInput()`, `button()`,
  `table()`, `tabs()`, and `commandInput()`
- `tableColumn()` when a table column needs typed cell content
- layout factories such as `column()`, `row()`, `grid()`, `surface()`,
  and `viewport()`
- the `behavior` namespace for controlled-state reducers and prepared views
- `resolveSelectedText()` and `copySelectedTextToClipboard()` for
  caller-controlled TUI text selection flows

The subpath entrypoints are:

- `@ismail-elkorchi/terminal-ui/host`
- `@ismail-elkorchi/terminal-ui/input`
- `@ismail-elkorchi/terminal-ui/interaction`
- `@ismail-elkorchi/terminal-ui/protocol`
- `@ismail-elkorchi/terminal-ui/text`
- `@ismail-elkorchi/terminal-ui/theme`
- `@ismail-elkorchi/terminal-ui/theme/packs`
- `@ismail-elkorchi/terminal-ui/prompts`
- `@ismail-elkorchi/terminal-ui/tui`
- `@ismail-elkorchi/terminal-ui/component`
- `@ismail-elkorchi/terminal-ui/components`
- `@ismail-elkorchi/terminal-ui/components/foundations`
- `@ismail-elkorchi/terminal-ui/components/forms`
- `@ismail-elkorchi/terminal-ui/components/collections`
- `@ismail-elkorchi/terminal-ui/components/overlays`
- `@ismail-elkorchi/terminal-ui/components/feedback`
- `@ismail-elkorchi/terminal-ui/components/patterns`
- `@ismail-elkorchi/terminal-ui/components/visualizations`
- `@ismail-elkorchi/terminal-ui/layout`
- `@ismail-elkorchi/terminal-ui/behavior`
- `@ismail-elkorchi/terminal-ui/renderer`
- `@ismail-elkorchi/terminal-ui/graphics`
- `@ismail-elkorchi/terminal-ui/accessibility`
- `@ismail-elkorchi/terminal-ui/transcript`
- `@ismail-elkorchi/terminal-ui/testing`

All public results use typed data for ordinary cancellation, validation
failure, non-TTY denial, transcript replay mismatch, and terminal capability
problems.

Clipboard sequence and sink helpers live under the protocol entrypoint and are
gated by explicit caller policy; they do not import or inspect terminal hosts.
TUI selection helpers resolve selected text from caller-controlled source state,
reject explicitly unavailable clipboard output, and then delegate an authorized
bounded protocol write. A successful write reports transport submission, not
clipboard observation. Clipboard reading is not exposed by the protocol API.
Components never write to the clipboard directly.

Rendering APIs live under the renderer entrypoint and expose the current frame
pipeline explicitly: `FrameBuffer`, `FrameCellSource`, `RenderSpan`,
`RenderLine`, `RenderBlock`, `Frame`, render-span helpers, measurement helpers,
`diffFrames()`, `renderFramePlain()`, `renderFrameAnsi()`, `renderFrameDebug()`,
and `renderDiffAnsi()`. See
[Rendering internals](../guides/rendering-internals.md) for how those pieces
fit together.

Owned RGB/RGBA resources, image fit, and placement contracts live under the
graphics entrypoint. The root entrypoint exposes `rasterImage()` and `image()`
for the normal application path. See [Terminal graphics](../guides/graphics.md).

Application and component APIs are described in [Building terminal apps](../guides/building-terminal-apps.md),
[Components](../guides/components.md), and
[Behavior helpers](../guides/behavior.md). Reusable component authoring is
described in [Component definitions](../guides/component-definitions.md).
