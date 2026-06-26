# Non-TTY Behavior

Non-TTY behavior is deterministic and surface-specific.

- Input prompts may use line fallback when configured; text and password
  defaults can be submitted unless the caller explicitly rejects non-TTY use.
- Confirm prompts need a default or explicit provided value.
- Choice prompt defaults only mark the interactive selection state. `select()`,
  `multiselect()`, and `autocomplete()` reject in non-TTY mode unless the
  caller provides an explicit `provided_value` contract.
- Progress prompts can run in transcript-only mode.
- Full-screen TUI surfaces reject non-TTY hosts.
- Shells can run transcript-only or reject depending on caller policy.

Diagnostics should tell callers which explicit input source, default, manifest,
environment value, or policy can make the interaction non-interactive.
Use `diagnosticHint` on prompt and shell non-TTY policies to include that
caller-facing alternative in typed denial diagnostics.
