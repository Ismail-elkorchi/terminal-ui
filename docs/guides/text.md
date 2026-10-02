# Text Measurement

The `/text` entrypoint owns terminal-safe text handling: sanitization,
grapheme segmentation, cell measurement, clipping, wrapping, and text-buffer
editing.

Text functions sanitize terminal control sequences before measurement or
display-facing output. Editing and cursor movement operate on grapheme
boundaries, so combined characters and emoji are not split by ordinary edit
operations. The source-boundary index is shared by movement, selection,
deletion, replacement and measurement; it is independent of terminal widths.
An edit can join graphemes across its seam, so its resulting caret is placed
after the complete joined cluster. Unchanged logical lines reuse their source
boundaries across document edits and width-profile changes.

Boundary indexes advance lazily. Standalone string helpers use a bounded global
cache; edit buffers and document revisions own their indexes even when a line
exceeds that cache budget. Document indexes read from the rope, so navigation
does not repeatedly flatten an oversized logical line. Index storage is
proportional to the visited source, and complete offset pages are shared across
edits and released with their owners.

The first lookup can traverse a logical-line prefix. An edit retains the known
unchanged prefix, restarts at the beginning of the entire preceding grapheme,
and lazily resegments the remaining suffix. It does not assume a fixed-size
Unicode context or reuse potentially changed suffix boundaries. Regional
indicator parity can change all following boundaries; one enormous grapheme
still requires its full segmentation context. Neither cold lookup nor an edit
has a constant-time guarantee. Width-profile changes reuse source boundaries.

Retain the returned buffer or document when continuing an editing session.
Stateless calls such as `normalizeTextCursor(hugeString, offset)` have no owner;
if that string exceeds the global cache budget, each call can scan its prefix
again. Reconstructing a fresh buffer from only its text also discards its owned
index.

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

`createTerminalTextIndex()` indexes grapheme offsets and word boundaries once.
Its word-selection and word-movement lookups use that retained index. Immutable
text documents retain these indexes per visited line and naturally invalidate
them when an edit produces a new document.

## Cell Width

Cell measurement uses `defaultTextWidthProfile`: emoji presentation is wide and
East Asian ambiguous characters are narrow. Callers and terminal hosts may pass
one explicit `widthProfile` with independent `emoji` and `ambiguous` policies.
`emoji: 'codepoint'` measures the visible scalars of emoji sequences separately,
for terminals that do not join ZWJ/modifier/variation sequences into one glyph.
It does not change grapheme boundaries for cursor movement or editing. Select
this policy from measured terminal behavior; terminal names alone are not proof
of a width policy. The default remains joined wide emoji.

`measuredGraphemes(text, options)` lazily yields source offsets and cell widths
without materializing a whole-string array. Callers can stop iteration or yield
between bounded batches when preparing large documents.

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

`sanitizeTerminalControlText()` removes unsafe control sequences while retaining
tabs and source-removal metadata. Use it when a source-mapped layout owns tab
expansion; `sanitizeTerminalText()` also performs display expansion.
