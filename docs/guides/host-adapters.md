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
explicit streams, environment values, viewport settings, and memory-host
settings through the selected adapter.

`createPtyTerminalHost()` wraps caller-supplied PTY-style input and output
streams. It does not spawn processes, supervise child lifecycles, or create
history/checkpoint files; those policies stay with the caller or test harness.
The adapter reports output-side TTY protocols by default and exposes an
explicit `resize()` method that forwards viewport changes to the supplied PTY
resize hook. Raw input is reported only when the input stream provides a
`setRawMode()` hook; otherwise `enableRawInput()` returns a typed unsupported
protocol diagnostic.
It is also available through `createTerminalHost({ adapter: 'pty', ... })`.

Hosts expose input, output, signals, environment, viewport, capabilities, clock,
and session-managed terminal restoration.
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
Built-in host `dispose()` methods also restore active sessions with the
`disposed` reason before releasing host-owned state.
