# Transcripts and Replay

Transcripts are deterministic interaction recordings. They can include
normalized input events, frames, render diffs, accessible snapshots,
diagnostics, and terminal restore checkpoints.

Transcript capture is opt-in for interactive prompts and TUI sessions with
`transcript: true`; prompt `transcript_only`
non-TTY mode is an explicit transcript-producing mode. Sensitive prompt values
and caller-provided secrets should be redacted before transcripts are exported.
Redaction records the concrete transcript path that changed, so exported
recordings stay auditable without leaking the original value.

Replay is exported from both `/transcript` and `/testing`. The `/transcript`
entrypoint owns validation and replay sequencing against any structural replay
target, while `/testing` provides the memory harness target most downstream
tests use. Replay validates transcript structure before reconstructing
interaction steps. Frame, render diff, accessible snapshot, diagnostic, input,
and restore entries must be shaped as their public machine-readable contracts,
not just tagged with a step kind.

The transcript carries one numeric `formatVersion` for the complete persisted
record. Pass parsed data directly to `validateTranscript()` or
`replayTranscript()`; both treat it as untrusted input, and replay proceeds only
after structural and semantic validation succeeds. Recorded application
messages that are already JSON-safe are copied exactly. Other application
message values receive one deterministic, bounded JSON snapshot at the recorder
boundary. Parsed transcripts are never normalized: values outside the exact
persisted contract are rejected.

Diagnostics separate immutable content from reported occurrences. A
`TerminalDiagnostic.fingerprint` identifies equal sanitized content. A
`DiagnosticOccurrence` contains a `TerminalDiagnostic` together with an
owner-local `id` and `sequence` assigned when that content first reaches a
runtime, transcript, or other reporting boundary.
Recording the same occurrence twice is idempotent; reporting equal content
twice creates two occurrences. Consumers may group occurrences by
`diagnostic.fingerprint` for presentation, but transcripts preserve every
occurrence.
