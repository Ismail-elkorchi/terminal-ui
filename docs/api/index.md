# API Overview

`terminal-ui` publishes one root entrypoint and focused subpath entrypoints.
The root entrypoint exposes the main vertical path:

- `createTerminalHost()` and `createMemoryTerminalHost()`
- `runPrompt()`
- `defineTui()`, `runTui()`, `createTuiRuntime()`, and subscription sources
- common typed component factories such as `textInput()`, `button()`,
  `table()`, and `commandBar()`
- layout factories such as `stack()`, `row()`, `grid()`, `surface()`,
  `tabs()`, and `viewport()`
- `resolveSelectedText()` and `copySelectedTextToClipboard()` for
  app-owned TUI text selection flows
- `toAccessibleSnapshot()`, `findAccessibleNode()`, and
  `validateAccessibleSnapshot()`

The subpath entrypoints are:

- `@ismail-elkorchi/terminal-ui/host`
- `@ismail-elkorchi/terminal-ui/input`
- `@ismail-elkorchi/terminal-ui/protocol`
- `@ismail-elkorchi/terminal-ui/text`
- `@ismail-elkorchi/terminal-ui/theme`
- `@ismail-elkorchi/terminal-ui/prompts`
- `@ismail-elkorchi/terminal-ui/tui`
- `@ismail-elkorchi/terminal-ui/components`
- `@ismail-elkorchi/terminal-ui/layout`
- `@ismail-elkorchi/terminal-ui/behavior`
- `@ismail-elkorchi/terminal-ui/renderer`
- `@ismail-elkorchi/terminal-ui/accessibility`
- `@ismail-elkorchi/terminal-ui/transcript`
- `@ismail-elkorchi/terminal-ui/testing`
- `@ismail-elkorchi/terminal-ui/schemas`

All public results use typed data for ordinary cancellation, validation
failure, non-TTY denial, transcript replay mismatch, and terminal capability
problems.

Clipboard helpers live under the protocol entrypoint. They are capability and
policy gated; widgets never write to the clipboard directly.
TUI selection helpers resolve selected text from caller-owned source state and
then delegate clipboard mutation to the same explicit protocol policy.

Rendering APIs live under the renderer entrypoint and expose the current frame
pipeline explicitly: `FrameBuffer`, `FrameCellSource`, `RenderSpan`,
`RenderLine`, `RenderBlock`, `Frame`, render-span helpers, measurement helpers,
`diffFrames()`, `renderFramePlain()`, `renderFrameAnsi()`, `renderFrameDebug()`,
and `renderDiffAnsi()`. See
[Rendering internals](../guides/rendering-internals.md) for how those pieces
fit together.

Authoring APIs are described in [UI authoring](../guides/ui-authoring.md),
[Components](../guides/components.md), and
[Behavior helpers](../guides/behavior.md). Renderer escape hatches are
described in [Renderer extensions](../guides/renderer-extensions.md).
