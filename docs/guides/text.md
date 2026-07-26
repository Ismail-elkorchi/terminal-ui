# Text Measurement

The `/text` entrypoint owns terminal-safe text handling: sanitization,
grapheme segmentation, cell measurement, clipping, wrapping, and text-buffer
editing.

Text functions sanitize terminal control sequences before measurement or
display-facing output. Editing and cursor movement operate on grapheme
boundaries, so combined characters and emoji are not split by ordinary edit
operations.

## Word Navigation

Word selection, movement, and deletion use Unicode word segmentation through
`Intl.Segmenter`. Punctuation, whitespace, and emoji separate word-like
segments; Arabic and CJK text do not require whitespace separators. Returned
offsets remain UTF-16 code-unit offsets aligned to grapheme boundaries, so the
terminal text index can map them to grapheme and cell positions without
splitting combining sequences.

The default word locale is explicitly `en`; it does not depend on the process
locale. Boundary helpers, text indexes, and edit functions accept
`{ locale: "…" }` when an application needs another locale. Segmentation uses
the host runtime's Unicode implementation, so Unicode-data upgrades may refine
language boundaries. Node, Deno, and Bun therefore share the locale contract
and grapheme-alignment invariants rather than a package-owned Unicode data
version.

`createTerminalTextIndex()` prepares grapheme offsets and word boundaries once.
Its word-selection and word-movement lookups use that prepared data. Immutable
text documents retain these indexes per visited line and naturally invalidate
them when an edit produces a new document.

## Cell Width

Cell measurement uses `defaultTextWidthProfile`: emoji presentation is wide and
East Asian ambiguous characters are narrow. Callers and terminal hosts may pass
one explicit `widthProfile` with independent `emoji` and `ambiguous` policies.
East Asian wide and fullwidth code points measure as two cells. Clipping,
padding, fixed-cell filling, wrapping, indexing, and output planning use the
same profile and Unicode 17 width data, so output stays inside the requested
cell budget. `padTextCells()` aligns text to a minimum cell width, while
`fillTextCells()` repeats a visual pattern into an exact cell budget and fills
any sub-glyph remainder with spaces.

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
