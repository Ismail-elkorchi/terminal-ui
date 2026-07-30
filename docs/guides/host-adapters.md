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
returns that resolved profile without terminal I/O. A caller that intends to
enable the Kitty keyboard protocol may request the bounded
`keyboardProtocol` active probe. The host temporarily owns raw input through a
terminal session, consumes only the documented `CSI ? flags u` response, and
replays unrelated input in its original order. `runTui()` requests this probe
only when its session policy asks for a Kitty profile and existing evidence is
still unknown.
Output writes are asynchronous and ordered. A resolved write has crossed the
adapter's native backpressure boundary; `flush()` settles every write accepted
before it. Node adapters wait for write callbacks and `drain`, Web Stream
adapters retain one writer and await each write, and memory/PTY adapters expose
the same completion semantics. Runtime scheduling uses the host's monotonic
clock; wall-clock changes do not affect pointer timing, animation deadlines, or
cleanup bounds.
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
