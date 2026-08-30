# Terminal Graphics Compatibility

Graphics remain preview until each protocol path below has physical-terminal
evidence for placement, clipping, replacement, cleanup, resize, and text
fallback. Evidence is tracked at three distinct levels so deterministic byte
tests are not mistaken for emulator behavior, and a virtual display is not
mistaken for a physical system.

| Path | Deterministic protocol evidence | Real-emulator CI | Physical-system evidence |
| --- | --- | --- | --- |
| Kitty, direct transport | Complete | Kitty 0.48.2 on Xvfb | Pending |
| Kitty through tmux passthrough | Complete | Pending | Pending |
| SIXEL with verified cell pixels | Complete | Pending | Pending |
| Plain-cell fallback | Complete | Kitty 0.48.2 on Xvfb | Not protocol-dependent |

The required Linux emulator job downloads the official Kitty 0.48.2 x86-64
binary with a pinned SHA-256 checksum, runs it with software rendering under
Xvfb, and launches a real `terminal-ui` application inside the emulator. Kitty's
own remote-control and screen model drive or verify:

- raw text and bracketed paste;
- enhanced keyboard press and release events;
- left, right, and middle pointer activation;
- terminal resize delivery;
- alternate-screen restoration;
- direct graphics negotiation and cell-pixel reporting;
- raster placement geometry and graphical cleanup.

The job also captures emulator pixels before and after graphic removal. This is
real Kitty interpretation and rendering, unlike the controlled-stream PTY
harness. It still does not establish physical font, DPI, compositor, GPU, SSH,
or terminal-version compatibility.

Update this matrix only with a reproducible terminal name and version, transport
path, display environment, and the scenarios exercised above. Graphics can
leave preview after every pending physical-system row has at least one
maintained result.
