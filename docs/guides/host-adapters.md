# Host Adapters

Host adapters are the boundary between runtime streams and the runtime-agnostic
terminal interaction core.

Available adapters include:

- Node host
- Deno host
- Bun host
- memory host for deterministic tests
- PTY-style host for caller-managed pseudo-terminal streams

`createTerminalHost()` selects the current runtime host by default. Use
`createTerminalHost({ runtime: 'memory' })` or `createMemoryTerminalHost()` for
deterministic tests.
The generic factory forwards runtime-specific options, so callers can still pass
explicit streams, environment values, terminal-size settings, and memory-host
settings through the selected adapter.

`createPtyTerminalHost()` wraps caller-supplied PTY-style input and output
streams. It does not spawn processes, supervise child lifecycles, or create
history/checkpoint files; those policies stay with the caller or test harness.
The adapter reports output-side TTY protocols by default and exposes an
explicit `resize()` method that forwards terminal-size changes to the supplied PTY
resize hook. Raw input is reported only when the input stream provides a
`setRawMode()` hook; otherwise `enableRawInput()` returns a typed unsupported
protocol diagnostic.
It is also available through `createTerminalHost({ adapter: 'pty', ... })`.

Hosts expose input, output, signals, environment, terminal size, capabilities,
clock, and session-managed terminal restoration. `getTerminalSize()` reads the
current row and column dimensions; test and PTY hosts expose
`terminalSizeControl.setTerminalSize()` for deterministic resize delivery.
Capability facts supplied through host options use explicit
`supported`/`unsupported`/`unknown` evidence. `getCapabilities()` normally
returns that resolved profile without terminal I/O. Full-screen startup uses one
bounded host-owned response transaction to query relevant DEC modes, followed
by primary device attributes as a fence. The observed state supplies the outer
session snapshot for cursor visibility, alternate screen, paste, mouse tracking
and encoding, focus reporting, synchronized output, and Unicode grapheme mode.
Unrelated input is replayed in its original order.

When TUI graphics are enabled, startup also sends bounded Kitty, terminal-cell
pixel-size, and primary-device-attributes queries. Graphics support is recorded
only from the matching responses. A tmux session gets a second passthrough query
only when direct Kitty support was not proved; successful passthrough becomes
part of the capability evidence used by the renderer. `graphics: 'none'` skips
this probe entirely.

A caller that intends to enable the Kitty keyboard protocol may also request the
`keyboardProtocol` active probe. The request is followed by the same device-
attributes fence, so the result distinguishes support, unsupported, and an
inconclusive timeout. After a profile is pushed, stream hosts query the flags
again and restore the session's previous profile unless the exact requested
profile is observed. A failed restoration makes the keyboard state
indeterminate and aborts session setup. If probing is cancelled while a source
read is outstanding, its
generation is transferred to the next reader. A bounded incremental filter
removes a late split response and replays surrounding user input.
That filter has a finite quarantine lifetime; an identical retry waits for the
quarantine to retire so the previous transaction cannot consume the retry's
reply. Cancelling the caller that created an active probe also cancels the
host-owned probe operation, while callers sharing an existing probe cancel
only their own wait.

The built-in protocol dialect is the modern DEC/xterm sequence profile. Broad
environment families are evidence, not a substitute for observed mode state;
in particular GNU Screen does not establish alternate-screen support by name.
Custom hosts may provide explicit capability facts when their transport or
terminal dialect has stronger knowledge.
Output writes are asynchronous and ordered. A resolved write has crossed the
adapter's native backpressure boundary; `flush()` settles every write accepted
before it. Node adapters wait for write callbacks and `drain`, Web Stream
adapters retain one writer and await each write, and memory/PTY adapters expose
the same completion semantics. Runtime scheduling uses the host's monotonic
clock; wall-clock changes do not affect pointer timing, animation deadlines, or
cleanup bounds.
An `applied` terminal operation also reports assurance: `sent` means the
transport committed its sequence, `observed` means the host subsequently
confirmed the state, and `assumed` describes an unchanged outer-state fact.
Transport completion never claims that an unqueried terminal accepted a mode.
Raw-input adapters that expose an observation hook are read again after each
mutation; a setter that does not reach the requested state is rejected.
Restore results report `completed` changes with `sent` or `observed` assurance.
DEC-mode restoration is normally `sent`; raw input is `observed` only when the
adapter supplies and confirms an observation hook. A refresh replaces the
previous fenced mode-observation generation rather than retaining omitted
facts from an earlier terminal endpoint.
`restoreTerminalState(host)` restores the host's currently active terminal
sessions in reverse open order. If no session is active it returns a successful
empty restore result instead of opening a new no-op session.
`host.recoverTerminalState()` is the emergency path: it supersedes the normal
terminal-state queue, fences stale queued work, and uses recovery output so a
non-cooperative restore cannot block terminal recovery behind itself. It is for
bounded failure handling, not ordinary session closure.
Built-in host `dispose()` methods also restore active sessions with the
`disposed` reason before releasing host-owned state.

Input `release()` settles only after the current source read and iterator
closure can no longer consume bytes. A chunk received during that handoff is
retained for the next reader. Until the adapter confirms safe release, the host
rejects replacement readers; a non-cooperative iterator therefore leaves input
unavailable instead of risking data loss. Reader-wrapper cleanup and source
release are started independently so a wrapper with a hanging `return()` cannot
prevent a cooperative input authority from releasing its source.
