# Shells With cli-core

Shells are line-mode interaction surfaces over `@ismail-elkorchi/cli-core`
programs, manifests, or explicit adapters. Command semantics, command lookup,
option binding, validation, help, and execution planning remain owned by
`cli-core`.

`terminal-ui` owns shell input editing, suggestions, command palette views,
transcripts, accessibility snapshots, and terminal restoration.

cli-core parse, validation, and run diagnostics are preserved even when a
command succeeds, so warnings and informational diagnostics remain visible in
shell state and transcripts without changing command status.

Shell transcripts and diagnostics are redacted by default for common
secret-bearing command forms such as token/password flags and secret-like
environment assignments. Redaction happens after command parsing and execution;
command adapters still receive the original input.

When a shell is backed directly by a `cli-core` program, callers supply the
line-to-argv conversion function for their own command language. `terminal-ui`
does not implement a hidden argv tokenizer; it passes the produced argv tokens
to `cli-core` for command lookup, option binding, validation, and execution.

Executable example:

- `examples/shell/cli-core-shell.mjs`
