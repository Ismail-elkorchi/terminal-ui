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
import { createTuiCooperativeWorkContext, createTuiPreparedQuery } from '@ismail-elkorchi/terminal-ui/tui';
import type { TextDocument } from '@ismail-elkorchi/terminal-ui/text';

const preparation = createTuiPreparedQuery({
  id: 'editor-source',
  prepare: (document: TextDocument, context) =>
    prepareTextDocumentLine(document, 0, { geometry: true, words: true }, createTuiCooperativeWorkContext(context)),
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

Bidirectional ordering is a producer/session contract. The host's
`cellPresentation` capability means physical left-to-right cells in application
order, with no additional terminal reordering or mirroring, and matching cursor,
pointer and physical horizontal-arrow semantics. Font shaping, joining, diacritic
placement and cell width are separate concerns. No terminal-name heuristic or
mode-8 report establishes this complete invariant.

By default the text pipeline preserves logical order and does not change mode 8.
This ordinary pipeline accepts unknown, implicit and explicit initial modes and
makes no bidi-ordering guarantee. An initially explicit terminal does not require
an application to opt into mapped text. A visual-cell application supplies one
`TextPresentation` provider, created with `defineTextPresentation({ map })`, through
`runTui(app, { textPresentation, sessionPolicy: { ...defaultSessionProtocolPolicy,
cellPresentation: 'required' } })`. The provider must implement its Unicode bidi
policy; the library does not ship another bidi or shaping engine. A requested
mapped session rejects an absent provider or optional presentation setup: a visual
producer cannot silently fall back after rejected or indeterminate setup. Each
interactive TTY startup and suspension reacquisition must admit application-ordered
physical cells before a mapped application's output resumes. Explicitly selected
non-TTY `last_frame` and `transcript_only` modes use the same provider for frame
artifacts and hook contexts, preserving logical accessible text without negotiating
terminal modes.

The provider must be deterministic for its request, and a changed ordering policy
must have a new provider identity. The provider receives the complete logical
paragraph and the requested line's UTF-16 range. It returns a visual-order
permutation of grapheme source ranges, with a printable glyph and LTR/RTL direction
per cluster. The shared text index validates the grapheme bijection, source
boundaries and unchanged cell widths, and owns the visual/source map used for
painting, pointer hits, caret movement and selection. Application text, search
offsets, accessibility values, paste and submitted values stay logical. Provider
identity participates in retained layout, measurement and painting caches.

Logical styled spans are mapped together before clipping, preserving their style,
hyperlink and source metadata. A producer that already owns visual cell layout
marks spans `textOrder: 'visual'`; these spans delimit independent runs and are not
reordered again. `writeCell()` already means an explicitly positioned visual cell.
Never reorder serialized ANSI: it has lost the source/cluster and style ownership
needed by this contract. Frame and diff artifacts contain the same final visual
cells and require no second reordering pass during replay.

### Automatic admission and strict policy

Hosts use `capabilities.cellPresentation.policy: 'auto'` by default. Ordinary
memory and VT hosts need no presentation declaration or terminal-name allowlist.
With no known incompatible condition, an unknown or unrecognized mode-8 state is
admitted without changing terminal modes. An observed reset also needs no write.
The resulting full presentation has `assurance: 'assumed'` and snapshot provenance
`assumed`, including when a raw mode-8 reset was observed. Automatic admission is
a compatibility assumption, not proof of physical direction, coordinates or input
semantics.

For callers that cannot accept that assumption, select strict policy:

```ts
import { createNodeTerminalHost } from '@ismail-elkorchi/terminal-ui/host';

const host = createNodeTerminalHost({
  capabilities: { cellPresentation: { policy: 'strict' } },
});
```

Strict rejects admission that relies on an assumption. Native mode-8 readback does
not verify the entire invariant, so even observed reset can be rejected. Strict
policy does not promise that every terminal offers enough evidence for admission.

Host discovery sends bounded, namespace-specific DECRQM requests. Raw standard
ECMA-48 mode 8 (BDSM) is recorded as `bidiMode: 'unknown' | 'implicit' | 'explicit'`,
with its own provenance and restoration baseline. Its reset disables implicit
bidirectional processing but does not establish left-to-right character path.
An inherited, unqueryable RTL SCP character path remains part of automatic
admission's assumption; the host does not verify or repair it. VTE's explicit RTL
character path can mirror text, cursor and pointer coordinates while returning the same mode-8 reset and cursor-position replies as explicit LTR.
Clearing or reacquiring a screen does not repair inherited RTL direction. No SCP
direction write is sent: resetting SCP to its default would not restore an unknown
inherited value.

An observed mutable implicit mode must be reset and read back before automatic
admission. This requires raw input, observed mutability and a known restoration
baseline. The exact original mode is restored and verified afterward. A permanently
implicit mode, conflicting reports, failed writes and missing or uncertain
readback cannot fall back to an assumption. A supplied `initialState.bidiMode`
remains a raw restoration baseline with `explicit` provenance; it is neither an
observed mode report nor proof of physical cell semantics. An implicit supplied
baseline cannot authorize an unobserved mutable transition.

### Narrow configuration exceptions

Known Kitty and Konsole configuration hazards block automatic admission until the
caller has independently satisfied the applicable condition. The supported
exceptions are `kitty-force-ltr` and `konsole-bidi-disabled`. Each exception is
bound to an exact terminal/transport context, not a blanket terminal-family
qualification. Read the `cellPresentation.context` and `cellPresentation.conditions`
facts from `host.getCapabilities()` to identify that context and the applicable
conditions without maintaining your own terminal-identity classifier. A `null`
context means the context cannot safely scope an exception; do not substitute a made-up
context. Exceptions currently require a direct terminal connection. SSH and
tmux, screen or Zellij contexts return `null` because they cannot identify the
effective outer terminal/profile reliably. Ordinary SSH or multiplexer sessions
with no known configuration hazard can still use automatic native-grid admission;
that remains an assumption. Mixed identity evidence, such as a Ghostty
`TERM_PROGRAM` with an inherited `KITTY_WINDOW_ID`, or simultaneous Kitty and
Konsole markers, also produces no reusable exception context. The host does not
send an active terminal-identity probe; environment facts cannot verify the
effective outer terminal or profile.

For example, after independently configuring and checking Kitty's left-to-right
behavior in the current context:

```ts
import { createNodeTerminalHost } from '@ismail-elkorchi/terminal-ui/host';

const inspectingHost = createNodeTerminalHost();
const profile = await inspectingHost.getCapabilities();
const context = profile.cellPresentation.facts.find(
  fact => fact.name === 'cellPresentation.context',
)?.value;
const conditions = profile.cellPresentation.facts.find(
  fact => fact.name === 'cellPresentation.conditions',
)?.value;
await inspectingHost.dispose();

if (typeof context !== 'string' || !Array.isArray(conditions)
  || !conditions.includes('kitty-force-ltr')) {
  throw new Error('The expected Kitty context is unavailable');
}
const host = createNodeTerminalHost({
  capabilities: {
    cellPresentation: {
      exceptions: [{ condition: 'kitty-force-ltr', context }],
    },
  },
});
```

For a checked Konsole configuration with bidi disabled, use
`{ condition: 'konsole-bidi-disabled', context }` with its captured context.
Capturing a context does not validate the condition; the caller must check it and
preserve that configuration, including during suspended external terminal use.
Do not reuse the exception after changing the terminal or transport context.
Transient Kitty window IDs do not change the context, but recorded terminal
versions do. Hosts capture policy, exceptions and environment at creation; mutating
the original options afterward does not change admission or rescope an exception.
Exceptions remove only the named configuration hazard. They never override
negative mode evidence, write/readback uncertainty or strict policy, and successful
automatic admission still reports `assumed`.

The old top-level `cellPresentation: { qualification: ... }` option and
`TerminalCellPresentationQualification` type are removed. Use the capability
policy and, only when needed, a concrete condition exception. Generic
`cellPresentation` capability overrides/probe flags remain rejected.

### Evidence and lifecycle

Session snapshots expose `cellPresentation: 'unknown' | 'application-ordered'`
separately from raw BDSM. Raw mode observations and restoration can be `observed`
while the full physical invariant remains `assumed`. Accepted reports, original
mode-8 values, missing replies and conflicting reports remain in capability facts.
Mode-query completion owns both the requested mode replies and the trailing
primary-DA fence. An early DA cannot finish an empty or incomplete collection, and
a mode reply alone cannot release raw input while a split DA tail is still due.
The collection's `complete` fact describes mode-reply coverage; valid reports remain
usable if the fence is missing when the query times out. Discovery and final
restoration retain raw-input ownership through the existing bounded late-response
quarantine before releasing it, consuming late response tails while preserving
concurrent user keys. Accepted valid reports survive a collection timeout. An inconclusive refresh
cannot erase earlier implicit or conflicting evidence and reopen automatic
admission. Fresh nonconflicting mode evidence is needed to resolve those blockers.

An initial mode-query write failure also blocks admission and marks full
presentation evidence `indeterminate`, even though a query does not mutate the
mode. Timeout or unrecognized refresh results cannot clear that failure; a fresh
coherent known mode report is required. No fictitious mode restoration is
attempted for a failed query.

Late replies are quarantined before another query; retired evidence and replayed
prefixes cannot authorize new work. DECRQM has no transaction identifier, so
replies delayed beyond the bounded quarantine remain a transport limitation rather
than proof of query identity.

Required setup failures remain authoritative in `TuiRunError.primaryDiagnostic`
and `message`; `exit.diagnostics` retains the operation, requirement, rejection or
indeterminate outcome and evidence, including after suspension recovery. Missing
readback, raw-input failure, immutable modes and transport uncertainty keep their
actual diagnostic cause. Admission policy and exceptions cannot bypass them.

A mode report describes the global mode; it does not rewrite attributes retained
on existing terminal paragraphs. On admitted application-ordered acquisition, the
full-screen TUI establishes a fresh surface with the existing ED2 clear operation
before its first frame, and again after suspension reacquisition. It does this
only after successful setup. The low-level mode API never clears content, and
incremental or clipped clears never become full-terminal clears. VTE 0.80.1 retains
bidi flags per paragraph; this distinction is visible in its
[mode-change handler](https://github.com/GNOME/vte/blob/0.80.1/src/vteseq.cc#L374-L395)
and [paragraph-update logic](https://github.com/GNOME/vte/blob/0.80.1/src/vte.cc#L3355-L3425).

The same session authority restores the known initial state on normal exit,
startup failure, cancellation, suspension and disposal. Interrupted writes remain
indeterminate and are recoverable; restoration uses recovery output and verifies
its readback. Unknown initial mode states are never guessed or reset.

Verification has separate layers: deterministic tests establish source maps,
metadata preservation, clipping and full-frame/diff equivalence; a real terminal
must establish actual glyph ordering, joining and mark placement with its installed
font. The raw mode-8 boundary has been observed on Xfce/VTE 8001, with implicit →
explicit → implicit replies and raw-input restoration. An additional native
SCP-RTL test demonstrates that identical reset reports do not prove physical LTR
cells. Automatic admission does not extend those observations to every VTE version,
font, terminal, multiplexer or transport. Native control/selection and lifecycle
validation is still needed for physical-terminal guarantees.

`sanitizeTerminalControlText()` removes unsafe control sequences while retaining
tabs and source-removal metadata. Use it when a source-mapped layout owns tab
expansion; `sanitizeTerminalText()` also performs display expansion.

## Atomic cooperative editing

`prepareTextAreaReduction(state, transition, context)` (from `/behavior`) runs the
same computation as `textAreaReducer`. Preparation includes caret and selection
normalization, document mutation and Unicode seams, inverse extraction,
undo/redo, insertion grouping, UTF-8 history byte accounting and eviction. It
returns one complete `TextAreaReduction`; cancellation publishes no candidate.
Do not warm a document and then synchronously replay a large paste: payload
construction and history work need the same cooperative budget too.

`createTextAreaState({ document })` adopts an immutable document without
round-tripping through a string. `prepareTextAreaState(input, context)` also
prepares a cold nonzero initial caret/selection cooperatively. Supply exactly
one of `value` or `document`. A history-retention rejection is reported on the
reduction while the complete text edit remains accepted.

## Controlled editor workflow

`createTuiControlledEditor({ id, toMessage })` from `/tui` packages reliable
editing and latest-wins layout preparation in ordinary caller-owned child state.
It owns no hidden document store. Keep its returned state in your parent model,
compose its effects with `createTuiChild`/`liftTuiResult`, and send its completion
messages to `update`.

- `init(editing, generation)` starts a lifetime; use a fresh child generation on remount
- `requestIntent` bounds active plus queued intents before acceptance. Its result
  has an explicit `accepted` flag and a `rejected` output for overflow
- Only the FIFO head prepares, against the preceding accepted editing state.
  Relative navigation and undo/redo remain in order with typing and paste
- Capture `{ sourceEpoch, semanticRevision, generation }` in view callbacks and
  pass it as `origin` for absolute `moveTo`, pointer, scroll, replacement-range and
  change-set intents. Stale coordinates, including coordinates arriving behind
  queued edits, are explicitly rejected rather than applied to another revision
- Pass `state.editing`, `state.preparedLayout`, and an `onLayoutRequest` callback
  to `textArea`. Route only the exact accepted request to `requestLayout`.
  Layout completion changes prepared geometry, never live caret/selection/history
- Geometry-dependent keys during pending layout produce an explicit
  `unavailable: layout-pending` transition. Handle the controller's rejection
  output visibly; do not silently drop it
- Run failures, including runtime execution-policy rejection, leave the accepted
  head queued and dirty. Show the `failed` output and offer `retry` or explicit
  `discardPending`. A malformed terminal effect output faults the runtime
- `maxPendingIntents` defaults to 128. `maxPendingBytes` defaults to 1 MiB and
  bounds retained UTF-16 payload plus descriptor overhead, including the head.
  Optional `maxDocumentBytes` checks the complete candidate's UTF-8 size before
  acceptance; overflow blocks that head with a visible recoverable failure

`requestSettlement(state, token)` inserts a bounded FIFO save/close barrier. Its
`settled` output carries an immutable snapshot of every preceding accepted
intent; later edits may continue. Save that snapshot, then call `markSaved` with
that same snapshot on successful I/O. A late save never marks newer content as
saved. `isDirty` includes accepted pending edits, so an editor with an unchanged
displayed document can still require a dirty-close decision.

File I/O, save destinations and dirty-close decisions remain application-owned.
`replaceSource(state, editing, { pending: 'reject' | 'discard' })` requires an
explicit queue disposition. Merely hiding a tab should retain the child and its
accepted work; actual removal cancels that lifetime. See
[`editor-panel.ts`](../../examples/tui/features/editor-panel.ts) and
[`ide-editor.ts`](../../examples/tui/ide-editor.ts) for composition and save handling.
