# Runtime Support

The package is ESM-only and targets:

- Node `>=24`
- current Deno
- current Bun
- memory-backed hosts for tests

Node and Bun consumers usually install from npm. Deno and source-first
TypeScript consumers can import from JSR.

Runtime-specific behavior lives in thin host adapters. Core text, input,
prompt, component, layout, TUI, accessibility, transcript, and testing logic
stays runtime-agnostic.

The PTY-style host adapter is explicit: callers provide already-managed
pseudo-terminal streams and resize hooks. The package wraps those streams as a
terminal host without adding process supervision.

[Native terminal qualification](./native-terminal-qualification.md) exercises
the same graphics-independent task application under Node, Deno and Bun,
including real Unix PTY input/session regressions and an interactive procedure
for native terminal combinations. Automated Unix PTY results do not qualify
macOS Terminal, Windows ConPTY, hardware input methods or screen-reader speech.
The automated Linux Unix PTY lane passes with the current Bun 1.3.14 pin.
The earlier `.containing()` boundary disagreement is no longer on the editing
path; see the [segmentation history](./native-terminal-qualification.md#previously-observed-bun-segmentation-issue).
