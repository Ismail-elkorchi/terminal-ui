# Terminal Graphics Compatibility

Graphics remain preview until the physical-system rows below have maintained
evidence for placement, clipping, replacement, cleanup, resize, and text
fallback. Deterministic protocol tests, real emulators on a virtual display,
and physical systems are separate evidence classes.

| Path | Deterministic protocol evidence | Real-emulator CI | Physical-system evidence |
| --- | --- | --- | --- |
| Kitty, direct | Complete | Kitty 0.48.2 on Xvfb | Pending |
| Kitty through tmux | Complete | Kitty 0.48.2 + tmux 3.7c on Xvfb | Pending |
| SIXEL, direct | Complete | xterm 411 and WezTerm 20240203-110809-5046fc22 on Xvfb | Pending |
| SIXEL through tmux | Complete | xterm 411 + tmux 3.7c native SIXEL on Xvfb | Pending |
| Plain-cell fallback | Complete | Kitty and xterm lanes | Not protocol-dependent |

The required Linux emulator job downloads official archives with pinned
SHA-256 checksums. It builds tmux 3.7c with native SIXEL support and xterm 411
with SIXEL enabled, and runs Kitty 0.48.2 and WezTerm
20240203-110809-5046fc22 from pinned release binaries. The four protocol and
transport paths execute a real terminal-ui application under Xvfb with
software rendering; the direct SIXEL path is interpreted independently by
both xterm and WezTerm.

The Kitty lanes verify:

- raw text and bracketed paste;
- enhanced keyboard press events, plus release events on the direct path;
- left, right, and middle pointer activation;
- terminal resize delivery;
- alternate-screen restoration;
- graphics negotiation and terminal cell-pixel reporting;
- bottom-edge raster placement and cleanup.

The tmux Kitty lane passes only the uniquely identifiable Kitty query through
tmux. Image controls use passthrough, but display uses Kitty virtual placements
and U+10EEEE placeholder cells. Because those placeholders are ordinary tmux
cells, tmux can move, clip, replace, and redraw them. The lane forces a tmux
refresh and window switch before checking the image again. Direct cursor-owned
Kitty placements are not used through tmux.

tmux 3.7c does not preserve Kitty key-release events on this path. The direct
Kitty lane therefore requires both press and release, while the tmux lane
records one press and no release. Applications must not infer end-to-end event
delivery solely from the keyboard-profile query when a multiplexer is between
the application and terminal.

The SIXEL lanes verify direct xterm interpretation and tmux's native SIXEL
parser. tmux is compiled with `--enable-sixel`; SIXEL is not wrapped in a
generic passthrough control. Both lanes place an image whose component reaches
the bottom screen edge, verify that the raster stops above terminal-ui's
text-only SIXEL scroll guard without scrolling the frame, compare emulator
pixels with reported cell geometry, and verify that removal leaves no stale
raster pixels.

The WezTerm lane verifies the direct SIXEL path through a separately
implemented parser and renderer. WezTerm's stable build supports alternate
screen operation but reports it as unavailable through the mode-report query,
so the conformance host supplies that known host fact explicitly; graphics
support and cell geometry remain actively negotiated. The lane verifies raw
text input, graphics negotiation, cell-relative image geometry, and bounded
cleanup.

These jobs are real emulator implementations, unlike the controlled-stream PTY
harness. Xvfb still cannot prove physical font rendering, DPI scaling, GPU and
compositor behavior, Wayland behavior, SSH transport, IME input, or a terminal
version not present in the pinned matrix.

## Physical evidence

Run physical checks locally on the actual terminal. A permanent self-hosted
runner is intentionally not attached to public pull requests: repository code
from a pull request must not gain execution authority on a persistent personal
machine.

The physical runner executes the same application and records the exact
terminal-ui commit, terminal identity, OS/display environment, negotiated
capabilities, diagnostics, and SHA-256 identities of visible and removed
screenshots:

```sh
npm run check:emulator:physical -- \
  --protocol=kitty \
  --transport=direct \
  --terminal=Ghostty \
  --terminal-version=1.2.3 \
  --visible-screenshot=/path/to/graphics-visible.png \
  --hidden-screenshot=/path/to/graphics-hidden.png
```

For tmux use `--transport=tmux-passthrough` with Kitty or
`--transport=tmux-native` with SIXEL. Evidence is written under
`.artifacts/emulator/physical/` and remains local unless it is deliberately
reviewed and published.

Update the matrix only from reproducible evidence that names the terminal and
version, multiplexer and version when applicable, operating system, display
environment, transport path, and exercised scenarios.
