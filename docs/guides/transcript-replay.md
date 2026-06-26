# Transcripts and Replay

Transcripts are deterministic interaction recordings. They can include
normalized input events, frames, render diffs, accessible snapshots,
diagnostics, and terminal restore checkpoints.

Transcript capture is opt-in for interactive prompts and shell sessions. Prompt
and shell APIs expose `transcript: { enabled: true }`; prompt `transcript_only`
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
