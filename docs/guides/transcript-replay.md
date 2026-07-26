# Transcripts and Replay

Transcripts are deterministic interaction recordings. They can include
normalized input events, frames, render diffs, accessible snapshots,
diagnostics, and terminal restore checkpoints.

Transcript capture is opt-in for interactive prompts and TUI sessions. Prompt
and TUI APIs expose explicit transcript policies; prompt `transcript_only`
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

Schema versions identify these serialized contracts. The interaction
transcript, frame, render-diff, and accessibility schemas form a linked schema
set; register the published `schemaArtifacts` when compiling them. In-memory
renderer and inspection objects do not carry schema versions.

Diagnostics separate immutable content from reported occurrences. A
`TerminalDiagnostic.fingerprint` identifies equal sanitized content. A
`DiagnosticOccurrence` adds an owner-local `id` and `sequence` when that
content first reaches a runtime, transcript, or other reporting boundary.
Recording the same occurrence twice is idempotent; reporting equal content
twice creates two occurrences. Consumers may group occurrences by fingerprint
for presentation, but transcripts preserve every occurrence.
