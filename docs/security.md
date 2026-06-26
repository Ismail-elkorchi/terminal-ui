# Security and Redaction

Terminal input and output are adversarial boundaries.

`terminal-ui` sanitizes untrusted terminal text before it is displayed,
recorded, snapshotted, or placed in diagnostics. Control sequences belong in
typed protocol APIs, not in user-supplied labels, choices, titles, or command
output. Protocol APIs validate their own parameters before emitting terminal
control sequences.

Password prompts mask rendered input, honor caller-provided mask symbols, and
redact secrets from transcripts and snapshots. Interactive prompt and shell
transcript capture is opt-in.
Shell transcripts and shell diagnostics redact common secret-bearing command
argument forms by default, including token/password flags and secret-like
environment assignments.
Shell history, recovery files, and
checkpoint files are never written unless the caller supplies an explicit
history provider or checkpoint policy.

Terminal sessions restore raw input, alternate screen, bracketed paste, mouse
reporting, focus reporting, and cursor visibility across success, cancellation,
interruption, timeout, and thrown failures.

Clipboard mutation is not a widget side effect. Selection helpers return text,
and OSC 52 clipboard writes are exposed through explicit protocol helpers that
require caller policy and host capability support before emitting a sequence.
