# Terminal Graphics Compatibility

Graphics remain preview until each protocol path below has physical-terminal
evidence for placement, clipping, replacement, cleanup, resize, and text
fallback. Automated tests cover capability negotiation, bounded encoding,
resource identity, and lifecycle cleanup, but they are not substitutes for a
real terminal implementation.

| Path | Automated evidence | Physical-terminal evidence |
| --- | --- | --- |
| Kitty, direct transport | Complete | Pending |
| Kitty through tmux passthrough | Complete | Pending |
| SIXEL with verified cell pixels | Complete | Pending |
| Plain-cell fallback | Complete | Not protocol-dependent |

Update this matrix only with a reproducible terminal name and version, transport
path, and the scenarios exercised above. Graphics can leave preview after every
pending row has at least one maintained physical-terminal result.
