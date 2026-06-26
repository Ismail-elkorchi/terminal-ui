# API Overview

`terminal-ui` publishes one root entrypoint and focused subpath entrypoints.
The root entrypoint exposes the main vertical path:

- `createTerminalHost()` and `createMemoryTerminalHost()`
- `runPrompt()`
- `createShell()` and `runShell()`
- `defineTui()`, `runTui()`, `layoutWidget()`, `renderWidgetFrame()`,
  `diffFrames()`, `renderDiff()`, and `renderFrame()`
- `toAccessibleSnapshot()`, `findAccessibleNode()`, and
  `validateAccessibleSnapshot()`

The subpath entrypoints are:

- `@ismail-elkorchi/terminal-ui/host`
- `@ismail-elkorchi/terminal-ui/input`
- `@ismail-elkorchi/terminal-ui/protocol`
- `@ismail-elkorchi/terminal-ui/text`
- `@ismail-elkorchi/terminal-ui/theme`
- `@ismail-elkorchi/terminal-ui/prompts`
- `@ismail-elkorchi/terminal-ui/shell`
- `@ismail-elkorchi/terminal-ui/tui`
- `@ismail-elkorchi/terminal-ui/widgets`
- `@ismail-elkorchi/terminal-ui/accessibility`
- `@ismail-elkorchi/terminal-ui/transcript`
- `@ismail-elkorchi/terminal-ui/testing`
- `@ismail-elkorchi/terminal-ui/schemas`

All public results use typed data for ordinary cancellation, validation
failure, non-TTY denial, transcript replay mismatch, and terminal capability
problems.

Clipboard helpers live under the protocol entrypoint. They are capability and
policy gated; widgets never write to the clipboard directly.
