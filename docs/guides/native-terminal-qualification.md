# Native terminal qualification

Use the shared [accessible task example](../../examples/tui/accessible-task.ts)
to exercise input and session ownership without requiring Kitty or SIXEL. The
native runner uses `createTerminalHost()` to select the actual Node, Deno or Bun
adapter and `runTui()` with `graphics: 'none'`. It does not replace native stdin,
terminal dimensions, resize notifications, or raw-mode control with memory
streams. Graphics qualification remains the separate
[`check:emulator:physical` procedure](./graphics-compatibility.md).

## Run on a native terminal

Build once with `npm run build`. Run **in the terminal being qualified**, using
the installed terminal's exact name and version. Do not pipe input or output.
The examples below use placeholders that must be replaced; the labels are
recorded as operator-supplied facts, not inferred from `TERM`.

```sh
node scripts/emulator/native.mjs --terminal=NAME --terminal-version=VERSION --transport=direct --output=.artifacts/native/node-visual.json
bun scripts/emulator/native.mjs --terminal=NAME --terminal-version=VERSION --transport=direct --output=.artifacts/native/bun-visual.json
deno run --allow-read --allow-env --allow-write --allow-sys --allow-run=git scripts/emulator/native.mjs --terminal=NAME --terminal-version=VERSION --transport=direct --output=.artifacts/native/deno-visual.json
```

`npm run check:terminal:native -- --terminal=NAME --terminal-version=VERSION
--transport=direct` builds and invokes the Node runner. Quote values containing
spaces. On Windows, run from a native terminal (for example Windows Terminal
with a PowerShell profile) and label the observed transport `ConPTY`; WSL is a
different Linux path and must not be reported as Windows ConPTY. A macOS run
must use the actual macOS terminal application. Use its About dialog or vendor
version command for its version; do not substitute the shell version.

Run each runtime with both `--output-mode=visual` (default) and
`--output-mode=accessible`. Use a separate report path for every case. The same
application handles the form, password masking, list selection, validation,
confirmation, progress and completion in both output modes.

### Input and normal exit

Use only the synthetic strings below. The report contains redacted transcript
events and the final accessible snapshot; never enter real credentials.

1. In the initially focused title, type `alphaé` and paste
   `-café é 世界 👩‍💻`. Check the title retains every character. Pasting committed
   Unicode text does not establish IME composition or dead-key support.
2. Press Left, Right, Ctrl+A, Right, Alt+Left, End, Shift+Tab, then Tab. Confirm focus
   leaves and returns to the title. Record terminal interception or remapping,
   such as Option producing text instead of Alt on macOS. A missing modifier
   event is a missing result, not a pass.
3. Resize the terminal. Check the display and report dimensions change. In
   accessible mode, Ctrl+L repeats current context without entering alternate
   screen. Complete the example's validation, selection, confirmation cancel
   and confirmation accept paths as additional application checks.
4. Exit with Ctrl+Q. Check the shell is usable: normal echo/editing, visible
   cursor, ordinary paste, correct primary-screen return in visual mode. Record
   that direct observation beside the report.

### Cancellation, signals and output failure

- Repeat with `--scenario=cancel`; after editing, press Ctrl+C. Verify shell
  restoration again. This application owns Ctrl+C and exits with completed
  status and reason `cancelled`. Where supported, also send SIGTERM from another shell and
  save a separate report. Keyboard Ctrl+C delivery and OS signal delivery are
  different paths.
- Repeat with `--scenario=output-failure`; type a character after the first
  frame. The runner rejects exactly one normal `host.stdout.write` after that
  frame and leaves the native recovery writer intact. An error exit is expected;
  raw input and session modes must still restore. This is controlled failure
  injection at the host boundary, not evidence of native EPIPE, a disconnected
  terminal, or a permanently broken recovery channel.
- Repeat on each exact OS/terminal/runtime combination you intend to qualify.
  A result for Node is not evidence for Deno or Bun, and a direct session is not
  evidence for a multiplexer session.

## What the report establishes

Reports include OS release/version/architecture, runtime name/version/executable,
terminal and transport labels, selected environment hints, exact commit,
worktree cleanliness, hashes of built JavaScript/application/probe, decoded
input, committed focus/dimensions, diagnostics and shutdown restoration results.
Dirty worktrees are explicitly marked; retain clean-commit evidence for a
release decision. Compact committed-state checkpoints retain the last 256 title/caret/focus/size
observations (title text capped at 1,024 code units), separately from the bounded
frame transcript. Checkpoint and transcript omission counts are explicit. A
temporary `.checkpoint` file lets automation wait for a specific committed
behavior before sending dependent input; it is not a second application or
input decoder.

The runner reports failure for an unexpected exit, failed restoration, or
host disposal that fails or exceeds one second. A stuck native handle can still
keep the process alive: the runner saves the failed report without forcing a
successful process exit. `checks.expectedExit`, `checks.restoreSucceeded` and
`checks.hostDisposed` do **not** assert that every
key, Unicode path, visual state, screen reader or terminal combination passed.
Inspect `observed.inputs`, compact checkpoints and diagnostics against
the steps actually performed. A nonzero `transcriptOmittedSteps` means earlier
transcript events are unavailable; do not treat their absence as evidence of
correct or incorrect decoding. Automated assertions use compact committed-state
acknowledgments rather than requiring unbounded frame retention. `sent` restoration assurance proves delivery to
the native output boundary; only direct observation or a terminal reply proves
the displayed state. Record observations that cannot be measured by the
application separately, including keyboard layout, IME/input method, screen
reader and version, speech order, shell restoration and any failures.

No hardware keyboard, IME/dead-key, screen-reader speech, macOS Terminal or
Windows ConPTY qualification is implied by Linux automation. An unavailable
native combination remains **unqualified**, rather than being represented by
simulated capability flags or another OS.

### Verified Bun qualification limitation

On Linux x86-64, Bun **1.3.14** (the CI pin) and **1.4.2** fail the Unicode
caret assertion. For `alphaé-café é 世界 👩‍💻`, grapheme iteration places the final
emoji at UTF-16 offset 18, but `Intl.Segments.containing(18)` returns the space
plus emoji starting at 17. Consequently, Left moves the application's caret
from 23 to 17 instead of 18. Both versions reproduced this independently of
the terminal transport; Node 24.19.0 and Deno 2.9.0/2.9.6 passed the same native
PTY assertion. These Bun versions remain unqualified for this input path.
The regression is intentionally retained and fails when either affected Bun
version is installed; it is not a skipped test or a change to the CI versions.
The dependency-free `a😀` reproduction is reported in
[Bun issue #44386](https://github.com/oven-sh/bun/issues/44386).

## Automated Unix PTY regression

`npm run check:integration` includes `native-session-pty.test.mjs`. When Python 3
and a runtime are available on Unix, it drives the **same application and
runner** through `pty.openpty`, for both output modes:

- Committed Unicode input and UTF-8 fragmentation, bracketed paste with split
  boundaries, legacy modifier encoding, focus movement and native SIGWINCH resize
- Normal Ctrl+Q exit, keyboard Ctrl+C cancellation, external SIGTERM, and
  injected post-commit output failure
- OS-observed raw mode while active and exact termios restoration after exit,
  protocol output and bounded process exit

Windows, missing Python, and missing runtimes produce explicit skips with the
unmeasured path named. This lane does not silently substitute a memory harness.
To retain all local artifacts instead of removing successful temporary runs:

```sh
python3 tests/emulator/native-session-pty.py --runtime=node --executable=node --output-directory=.artifacts/native/node
python3 tests/emulator/native-session-pty.py --runtime=deno --executable=deno --output-directory=.artifacts/native/deno
python3 tests/emulator/native-session-pty.py --runtime=bun --executable=bun --output-directory=.artifacts/native/bun
```

Each run saves per-case reports, raw synthetic terminal output and a summary.
It is a real Unix PTY transport regression, not a terminal emulator or physical
accessibility test.

### Native input handoff and suspension

The independent `native-input-handoff-pty.test.mjs` integration regression uses
ASCII sentinels, so it does not depend on the Bun Unicode caret path above. For
each available runtime it repeats three pending-read/release cycles, checks that
an inherited-stdin subprocess receives `C`, and verifies a replacement reader
receives `R`. It also repeats three `runTui()` effect calls to
`context.withTerminalSuspended()` in each of visual and accessible output modes,
checking that the child receives `C` and the resumed UI receives `R`. The Unix
PTY supervisor observes natural process exit without a forced `process.exit()`
in the fixture and exact termios restoration; a timeout is a failure. The
comparison observes input readiness once at each boundary, allowing the OS to
settle deferred canonical-input bookkeeping without consuming or flushing bytes.
It requires an empty input queue and equality of every flag, speed and control
character. Raw post-exit snapshots remain in the evidence; independent controls
verify queued bytes survive the observation and persistent mode changes remain
detectable. Run it
with `node --test tests/integration/native-input-handoff-pty.test.mjs` after
building. Optional `TERMINAL_UI_NODE_EXECUTABLE`, `TERMINAL_UI_DENO_EXECUTABLE`
and `TERMINAL_UI_BUN_EXECUTABLE` environment variables select exact runtime
binaries instead of the current Node executable and `deno`/`bun` on `PATH`.
Failed runs retain event journals, terminal output and supervisor exit evidence;
passing this ASCII-only check does not qualify Bun's separate Unicode path.
