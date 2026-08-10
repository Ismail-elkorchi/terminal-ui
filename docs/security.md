# Security and Redaction

Terminal input and output are adversarial boundaries.

`terminal-ui` sanitizes untrusted terminal text before it is displayed,
recorded, snapshotted, or placed in diagnostics. Control sequences belong in
typed protocol APIs, not in user-supplied labels, choices, titles, or command
output. Protocol APIs validate their own parameters before emitting terminal
control sequences.

Password prompts and `passwordInput()` mask rendered input, honor
caller-provided mask symbols, and omit secrets from accessibility output.
While a password input has focus, TUI input events and the messages they
produce are redacted in transcripts. Interactive prompt and TUI transcript
capture is opt-in. Transcript redaction records every modified path so exported
recordings stay auditable without leaking the original value.

Terminal sessions apply protocol setup through `SessionProtocolPolicy`, then
restore raw input, alternate screen, bracketed paste, mouse reporting, focus
reporting, and cursor visibility across success, cancellation, interruption,
timeout, and thrown failures. Required setup failures stop the full-screen run
before application rendering starts; optional or disabled operations are
recorded as diagnostics.

Clipboard mutation is not a component side effect. Selection helpers return text,
and OSC 52 clipboard writes are exposed through explicit protocol helpers that
require caller policy and an output-capable host before emitting a bounded
sequence. Unknown terminal support permits an authorized attempt; its result
reports only that bytes were sent. Explicitly unsupported terminals are rejected,
and clipboard reading is not exposed by the protocol API.
`resolveSelectedText()` works only from caller-controlled selectable sources and
does not infer selection from terminal-native emulator state. Use terminal
native selection when the application should not own or copy the selected text.
