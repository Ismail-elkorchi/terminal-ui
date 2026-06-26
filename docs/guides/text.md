# Text Measurement

The `/text` entrypoint owns terminal-safe text handling: sanitization,
grapheme segmentation, cell measurement, clipping, wrapping, and text-buffer
editing.

Text functions sanitize terminal control sequences before measurement or
display-facing output. Editing and cursor movement operate on grapheme
boundaries, so combined characters and emoji are not split by ordinary edit
operations.

## Cell Width

Cell measurement treats emoji as wide by default and accepts `emojiWidth:
"narrow"` for hosts that report narrow emoji behavior. East Asian wide and
fullwidth code-point ranges measure as two cells. Clipping and wrapping use the
same measurement rules as rendering, so output stays inside the requested cell
budget.

## Bidirectional Text

`terminal-ui` exposes `unicode.bidi: "stable-fallback"` in terminal
capabilities. The fallback policy is logical-order rendering: the package does
not reorder bidirectional text internally. Mixed-direction strings are
sanitized, segmented, measured, clipped, wrapped, rendered, and recorded in the
same logical order supplied by the caller.

This keeps layouts, frames, snapshots, render diffs, and transcripts
deterministic across runtimes. If a terminal applies its own bidirectional
display behavior, that behavior belongs to the terminal emulator; the
machine-readable `terminal-ui` artifacts remain logical-order data.
