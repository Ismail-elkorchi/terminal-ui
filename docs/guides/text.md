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
still requires its full segmentation context. Native grapheme inputs normally
cover at most 4,096 UTF-16 units (4,097 when needed to avoid splitting a surrogate
pair). The entire unfinished trailing cluster carries into the next input. If
that cluster fills the input, the input grows geometrically until a real boundary
or source end is found. There is no fixed lookbehind or maximum cluster length.
Cross-runtime tests compare these boundaries with each runtime's own native
whole-string segmentation. Neither cold lookup nor an edit has a constant-time
guarantee. Width-profile changes reuse source boundaries.

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

Word state belongs to the visited source and effective locale, with a bounded
set of retained locales. Movement, deletion and selection share it instead of
creating independent whole-text indexes. An unchanged logical line retains its
word state after edits elsewhere; changing that line invalidates its word state.
Old document revisions remain independently usable. Native iterator state does
not retain a previous document's rope-backed source wrapper.

Locale word segmentation is not chunked using the grapheme-window rule. Its
initial native setup receives the entire logical line, and each native callback
is indivisible. Iteration between callbacks is resumable. This distinction is
important for unusually long words and locale-sensitive dictionaries.

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

`createTerminalTextIndex()` and owned editor geometry answer offset/column
queries from numeric prefix pages. They do not build a whole-line array of
measured grapheme objects for each query. Width profiles own separate cell data
but share source boundaries, and edits preserve the measured unchanged prefix.
Vertical movement honors an existing preferred cell column without remeasuring
the current line. Explicit `graphemes` and byte-index requests still materialize
the corresponding full data. Selecting a small range only slices that range.

East Asian wide and fullwidth code points measure as two cells. Clipping,
padding, fixed-cell filling, wrapping, indexing, and output planning use the
same profile and Unicode 17 width data, so output stays inside the requested
cell budget. `padTextCells()` aligns text to a minimum cell width, while
`fillTextCells()` repeats a visual pattern into an exact cell budget and fills
any sub-glyph remainder with spaces.

## Cooperative source preparation

`prepareTextDocument(text, context)` cooperatively constructs an immutable
source document for initial large-file loading. It shares the direct
`createTextDocument()` computation and yields between bounded leaf-metric and
tree-building batches. Cancellation publishes no document. The input string
must already be available; file I/O and native string allocation are separate.

`prepareTextBuffer(buffer, request, context)` and
`prepareTextDocumentLine(document, lineIndex, request, context)` prepare the same
revision-owned work used by synchronous editing. They return source identity
and canonical request metadata; they do not apply or replay edits.

Requests can specify:

- `throughOffset`: a UTF-16 offset relative to the buffer or logical line
- `geometry: true`: prepare cell geometry through that offset
- `throughColumnCells`: prepare only as far as that visual column requires
- `words: true` and optional `locale`: prepare locale word navigation
- `widthProfile`: the cell-width policy for geometry

Without an offset, preparation covers the full source, except that a column-only
request starts at offset zero and stops after the requested column. Inputs and
width policy are captured before yielding. The context supplies an `AbortSignal`
and a scheduler yield, so applications retain control of scheduling.

```ts
import { prepareTextDocumentLine } from '@ismail-elkorchi/terminal-ui/text';
import { createTuiPreparedQuery } from '@ismail-elkorchi/terminal-ui/tui';
import type { TextDocument } from '@ismail-elkorchi/terminal-ui/text';

const preparation = createTuiPreparedQuery({
  id: 'editor-source',
  prepare: (document: TextDocument, context) =>
    prepareTextDocumentLine(document, 0, { geometry: true, words: true }, {
      signal: context.signal,
      yield: async () => { await context.clock.sleep(0, context.signal); },
    }),
  toMessage: result => ({ kind: 'sourcePrepared' as const, result }),
});
```

Use the existing effect's ordinary completion message. Check the returned
source identity against the current editor revision before accepting it; a
source can change through reliable input even when no replacement preparation
request was made. Keep editing messages ordered. A pending placeholder or the
previous accepted view can remain visible while preparing, and accepted data
is then reused by normal synchronous editing. Cancellation returns no partial
result, while already completed internal prefixes remain safe to reuse.

Source preparation alone does not prepare every component-level layout, such
as soft-wrap rows, decorations or scrollbars. Use the text-area layout preparation
API when activating or resizing a wrapped editor, as described in the
[component guide](./components.md). Direct synchronous APIs remain useful for
small fixed inputs and snapshots.

Cooperative checkpoints are not hard latency deadlines: native locale-word
setup, an individual native callback, and measurement of one enormous grapheme
cannot be preempted. Grapheme windows bound ordinary materialization but must
retain a complete oversized cluster. No word-boundary correctness claim relies
on truncating locale context.

To measure readiness as well as scheduling responsiveness, run:

```sh
node scripts/performance/benchmark-text-preparation.mjs 3
```

The probe reports total readiness time, scheduler time, yield counts, maximum
work slices, native input sizes and native callback times for ordinary ASCII,
Unicode, locale-word and giant-cluster inputs. Its synchronous comparison uses
the same native instrumentation. These are software scheduling measurements,
not physical terminal-input latency or portable performance guarantees.

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
