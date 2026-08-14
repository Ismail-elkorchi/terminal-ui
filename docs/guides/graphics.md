# Terminal Graphics

`terminal-ui` renders owned RGB and RGBA raster resources through the Kitty
graphics protocol or SIXEL. Graphics remain part of the renderer's frame model;
components never write protocol sequences themselves.

Create a raster resource once and retain it outside the application view:

```ts
import { image, rasterImage } from '@ismail-elkorchi/terminal-ui';

const pixels = new Uint8Array(64 * 32 * 4);
const preview = rasterImage({
  width: 64,
  height: 32,
  format: 'rgba8',
  data: pixels
});

const element = image({
  image: preview,
  label: 'Build preview',
  fallback: 'Build preview (graphics unavailable)',
  fit: 'contain',
  measurement: {
    minWidth: 8,
    minHeight: 3,
    preferredWidth: 32,
    preferredHeight: 10
  }
});
```

`rasterImage()` checks the dimensions and exact byte length, copies the pixel
buffer, and returns an immutable, nominal raster resource. Its SHA-256 content
identity is retained as metadata when frames are serialized into transcripts.
Retain that resource;
constructing an equivalent resource during every view call creates a new image
and requires another terminal upload.

`image()` always renders its plain terminal fallback into the cell frame. When
a verified graphics protocol is active, the runtime clears only the visible
graphic rectangle and places the raster over that fallback. Clipping follows
layout viewports and higher render layers, while later cell content occludes an
earlier graphic. The semantic variant requires a useful accessible label;
purely ornamental images use `decorative: true`.

The fit policies are:

- `contain` preserves the aspect ratio and letterboxes inside the component.
- `cover` preserves the aspect ratio and crops the source to fill the component.
- `fill` uses the full source and destination rectangles without preserving the
  aspect ratio.

`runTui()` and `createTuiRuntime()` accept `graphics: 'auto' | 'kitty' |
'sixel' | 'none'`. Graphics default to `none`, so applications without images
do not pay for capability queries. Opt into `auto` to select Kitty first and
SIXEL second, but only after an active terminal response proves support. Explicit
`kitty` or `sixel` modes fail startup if the requested protocol cannot be
verified. SIXEL also requires a verified terminal cell-pixel size so cell
geometry can be converted to pixels correctly.

SIXEL preserves fully transparent pixels when the theme leaves the terminal
background unchanged. Partially transparent pixels require an explicit RGB
`app.background` theme token because terminal ANSI palette slots and the
terminal's default background are user-configurable; the renderer does not
guess a composition color. Kitty receives the original RGBA pixels and does
not need this SIXEL composition policy.

Under tmux, direct probing runs first. If Kitty is not available directly, the
runtime tries tmux passthrough and records that transport only when the query
response proves it works. Environment variable names are never treated as
protocol support.

The public `graphics` entrypoint contains raster resources and frame-level
placement types. The `protocol` entrypoint contains the lower-level geometry
and Kitty/SIXEL encoders for host or renderer integrations. Application code
normally needs only `rasterImage()`, `image()`, and the TUI graphics mode.

This graphics layer intentionally accepts decoded, static RGB/RGBA pixels. It
does not read files, decode PNG/JPEG data, animate frames, or choose filesystem
and shared-memory transports. Those policies and decoders belong to the
application; the renderer owns terminal placement, clipping, caching, cleanup,
and fallback behavior.

Protocol references:

- [Kitty terminal graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [XTerm control sequences, including SIXEL and terminal cell-size reports](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)

Executable example:

- `examples/tui/graphics.ts`
