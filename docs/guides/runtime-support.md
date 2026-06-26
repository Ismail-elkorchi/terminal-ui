# Runtime Support

The package is ESM-only and targets:

- Node `>=24`
- current Deno
- current Bun
- memory-backed hosts for tests

Node and Bun consumers usually install from npm. Deno and source-first
TypeScript consumers can import from JSR.

Runtime-specific behavior lives in thin host adapters. Core text, input,
prompt, shell, widget, TUI, accessibility, transcript, and testing logic stays
runtime-agnostic.

The PTY-style host adapter is explicit: callers provide already-managed
pseudo-terminal streams and resize hooks. The package wraps those streams as a
terminal host without adding process supervision.
