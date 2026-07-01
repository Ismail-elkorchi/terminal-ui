# Non-TTY Behavior

Non-TTY behavior is deterministic and surface-specific.

- Input prompts may use line fallback when configured; text and password
  defaults can be submitted unless the caller explicitly rejects non-TTY use.
- Confirm prompts need a default or explicit provided value.
- Choice prompt defaults only mark the interactive selection state. `select()`,
  `multiselect()`, and `autocomplete()` reject in non-TTY mode unless the
  caller provides an explicit `provided_value` contract.
- Progress prompts can run in transcript-only mode.
- Full-screen TUI surfaces default to rejection. TUI definitions may opt into
  `transcript_only`, `last_frame`, or `line_fallback`. These fallback paths do
  not enter alternate screen, raw input, mouse reporting, focus reporting, or
  other full-screen protocols.
- `last_frame` and `line_fallback` output come from the same output projection
  as visual frames and accessibility snapshots. The human output includes an
  accessible linear summary followed by the plain frame, rather than only a raw
  rectangle dump.
- Shells can run transcript-only or reject depending on caller policy.

Diagnostics should tell callers which explicit input source, default, manifest,
environment value, or policy can make the interaction non-interactive.
Use `diagnosticHint` on prompt, shell, and TUI non-TTY policies to include that
caller-facing alternative in typed denial diagnostics.
