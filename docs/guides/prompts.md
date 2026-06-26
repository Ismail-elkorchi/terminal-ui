# Prompts

Prompts return typed results instead of throwing for ordinary cancellation,
timeout, validation failure, or deterministic non-TTY denial.
Interactive prompt transcripts are opt-in with `transcript: { enabled: true }`.
When enabled, they record normalized input plus the final diagnostics and
snapshot for submitted and aborted prompts.
The explicit `transcript_only` non-TTY mode still returns a snapshot transcript
because that mode is itself a transcript contract.

Available prompt primitives include:

- `confirm()`
- `input()`
- `password()`
- `select()`
- `multiselect()`
- `autocomplete()`
- `editor()`
- `progress()`

`password()` masks rendered input with `mask` when configured and keeps the
submitted value out of snapshots, transcripts, diagnostics, and terminal
output.

`confirm()` snapshots use the `checkbox` role and expose both `value` and
`checked` so assistive tooling can read the selected state directly.

`editor()` is the multiline authoring primitive. It does not spawn a process by
itself. Provide an explicit `editorAdapter` to own temporary files, spawning,
and cleanup. The prompt resolves command preference as `editorCommand`, then
`VISUAL`, then `EDITOR`, and passes the chosen argv candidate to the adapter
without shell interpolation.
When `timeoutMs` expires, the adapter receives an aborted signal and the prompt
returns typed timeout diagnostics.

Async choice prompts use the data-source `offset`, `limit`, and `hasMore`
contract. When more choices are available, PageDown requests the next page and
focuses the first enabled choice in that page. Autocomplete pagination preserves
the current query.

Choice search matches labels, descriptions, and keywords. Search keeps disabled
choices non-selectable.
Choice descriptions are rendered beside labels and included in accessible
snapshots. Prompt-rendered text is sanitized before it is written to the
terminal.
Interactive prompts honor `theme` for prompt symbols and styled terminal
output. Theme rendering sanitizes prompt text before adding trusted ANSI
styling, and non-color hosts receive plain text.
Interactive `input()` and `password()` prompts show pending and failing
validation status while the user types. Async validators receive an
`AbortSignal`; stale validation results are ignored, so a slower response for an
older value cannot overwrite the current prompt state. Password validation
feedback is redacted before it reaches terminal output, diagnostics, snapshots,
or transcripts.
`required: true` is enforced by the shared validation path before custom
validators, so interactive input, text/password/confirm non-TTY defaults, and
provided values produce the same typed validation result for empty values.
Choice `defaultValue` settings are interactive selection defaults; use an
explicit `nonTty: { mode: "provided_value", value }` contract for non-TTY
choice answers.
Choice prompts render explicit loading, empty, pagination, and data-source
diagnostic lines so callers are not left with a blank prompt body.
Data-source diagnostics are preserved in submitted prompt results and
transcripts when transcript capture is enabled, even when usable choices were
returned.
Autocomplete data sources honor `debounceMs` before refreshing async results,
and stale requests are cancelled so older results cannot overwrite newer input.

`multiselect()` supports Shift+Arrow/Home/End range selection when
`rangeSelection: true` is configured. Range selection skips disabled choices and
keeps submitted values in deterministic choice order.

`createProgress()` snapshots normalize determinate values into their accessible
range, so repeated updates cannot emit invalid progressbar state. `progress()`
uses the same value, max, status, and indeterminate contract for snapshots.
With `task`, `progress()` gives the task a controller with `update()` and an
abort `signal`. The prompt owns terminal rendering, cancellation, typed
results, snapshots, transcripts, and restoration; the task owns the work. In
non-TTY mode the default remains `transcript_only`, so task updates are captured
as snapshots without writing terminal control output.

Executable example:

- `examples/prompts/non-tty-input.mjs`
