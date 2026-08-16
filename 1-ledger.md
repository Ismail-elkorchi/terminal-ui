# Confirmed findings ledger for `1.md`

Audit basis: `main` at `7881ee5ee591fdf626746821977401d1e282b3a8`, inspected on 2026-08-15.

Execution status (2026-08-16): every repository-implementable node in Waves 0–4 is **Done**. No node is currently in progress. `GFX-4`, `INC-1`, `INC-2`, and `INC-3` are **Not started** because their stated admission evidence is external or not yet available; they were not silently treated as implementation work. Final verification is **Done**: `git diff --check`, API-reference regeneration/freshness, and the complete `npm run check` suite pass.

This ledger reconciles the four documents separated by `===` in `1.md`. It contains the findings that are both confirmed against the current repository and not rejected after investigation. Repeated observations are represented once at their common root. A dependency means that the prerequisite contract should be settled before the dependent item is implemented; it does not imply that unrelated branches must be delivered together.

## Dependency map

```text
NAV-1 canonical absent-active navigation
  ├─ COL-1 measured list-view integration ─┐
  ├─ COL-2 prepared tree source/index ─────┼─ COL-3 collection API pruning
  └─ A11Y-3 toolbar roving focus           │
                                           │
SEL-1 one selection authority              │
  ├─ COL-1 ────────────────────────────────┤
  ├─ COL-2 ────────────────────────────────┤
  ├─ MENU-1 valid radio groups             │
  └─ API-1 truthful availability policy    │
                                           │
QUERY-1 deterministic grapheme query       │
  ├─ QUERY-2 migrate query consumers ──────┤
  ├─ COL-2                                 │
  └─ POP-2 editable popup-input foundation │
                                           │
A11Y-1 description relationships/focus lifecycle
  ├─ A11Y-2 field and tooltip semantics
  ├─ A11Y-3 toolbar roving focus
  └─ POP-1 shared popup policies ──────────┐
                                           ├─ POP-2
EDIT-1 bounded text history/edit operation ┘
  └─ EDIT-2 command-input editing

RUN-1 public transactional dispatch
  └─ RUN-2 bounded mixed-delivery channel
       └─ RUN-3 explicit cadence admission

FRAME-1 preserve canonical frame ownership ─┬─ FRAME-3 terminal-cell equality
                                            └─ FRAME-4 bounded render traversal
FRAME-2 explicit canvas state in diffs ──────── FRAME-3
LAYOUT-1 shared constrained-box measurement ── API-3 authoring conveniences
HOOK-1 validate executable hook results once ─ INSPECT-1 definition-owned inspection
                                                └─ API-3

HOST-1 reset observations before refresh
  └─ HOST-3 screen-scoped Kitty keyboard state
HOST-2 require text-capable managed-TUI profiles
  └─ HOST-3
HOST-4 non-cancellable terminal recovery authority

GFX-1 shared graphics resource budget
  ├─ GFX-2 content-addressed Kitty resources
  ├─ GFX-3 damage-aware cached SIXEL output
  └─ GFX-4 physical-terminal compatibility evidence

TABLE-1 retained table structure inference ──┐
COL-3 collection API pruning ────────────────┼─ API-2 coherent public taxonomy
API-1 truthful availability policy ──────────┤
POP-2 editable popup-input foundation ───────┤
INSPECT-1 ───────────────────────────────────┘
API-2 ── API-3 ── API-4 generated API reference
          └──────── TEST-1 catalog-wide conformance
```

## Wave 0: correctness and ownership

### NAV-1 — Make absent-active navigation canonical

**Status:** Done. **Dependencies:** none.

`src/interaction/navigation.ts` honors `NavigationPolicy.initial`, but `adjacentIndexedItemId()` in `src/interaction/collection.ts` does not. Grid navigation in `src/behavior/table.ts` similarly converts an absent row or cell to index zero and then applies the movement delta. Consequently, the first ArrowDown or ArrowRight can land on the second target.

Replace the parallel implementations with one absent-aware indexed navigation operation. When no active target exists, the operation must choose the policy's initial target without applying the requested delta. Rows, cells, listboxes, trees, tabs, menus, and other collection behaviors should consume that operation rather than encode their own initial transition.

**Completion evidence:** shared behavior tests prove initial forward/backward movement, empty collections, disabled-target skipping, boundaries, and wrap/no-wrap behavior for both one- and two-dimensional consumers.

### SEL-1 — Give selection one discriminated authority

**Status:** Done. **Dependencies:** none.

The current interaction contract can represent `mode: 'multiple'` with `commitment: 'followActive'`, but reducers implement that combination by replacing selection with a singleton. Selection mode also appears independently in controlled state, reducer policy, and grid options. These authorities can contradict one another.

Replace the split state/policy contract with one discriminated controlled selection value:

- no selection;
- single selection with its commitment policy and selected ID;
- multiple manual selection with selected IDs and an optional range anchor.

Do not keep multiple-selection `followActive` without a complete modifier/range interaction model. Reducers must derive permissible transitions from the controlled value they receive rather than accept a second mode. Components may still maintain an independent active position.

**Completion evidence:** impossible combinations fail at compile time; JavaScript boundaries validate only the discriminant and fields they consume; cross-family tests distinguish navigation, selection commitment, activation, range extension, and controlled-state updates.

### FRAME-1 — Preserve canonical frame ownership when attaching accessibility

**Status:** Done. **Dependencies:** none.

`candidateFromRenderResult()` in `src/tui/runtime-frame.ts` creates a spread copy to attach accessibility. The copy is not frozen and loses the frame snapshot metadata held in the renderer's private `WeakMap`. This breaks the immutability and retained-index guarantees of frames produced by the renderer.

Add one renderer-owned operation for attaching or replacing accessibility on a frame. It must create a frozen canonical frame and transfer/rebuild the private frame indexes without exposing them. The TUI must use that operation rather than structurally copying a frame.

**Completion evidence:** runtime frames remain frozen; metadata/index reuse survives accessibility attachment; renderer and TUI paths produce equivalent canonical frames.

### FRAME-2 — Put canvas state explicitly in the diff contract

**Status:** Done. **Dependencies:** none.

The frame diff projection does not carry `canvasStyle`, and diff replay ignores the style of `clearRect`. Replaying a diff can therefore produce a frame whose background semantics differ from the source frame.

Make the target canvas style explicit in the internal diff descriptor and replay it directly. Do not infer persistent canvas state from an arbitrary sequence of cell operations. Keep clear-operation styling for terminal output, but do not use it as a hidden state channel.

**Completion evidence:** applying a full or incremental diff reconstructs the target frame including canvas style; transitions between default, colored, minimal, and no-color canvases are covered.

### HOST-1 — Reset observations at the start of capability refresh

**Status:** Done. **Dependencies:** none.

Capability detection resets its local facts, but `TerminalStateAuthority` retains previously observed modes and keyboard state unless a later probe succeeds. A refresh against a different endpoint or after a failed query can therefore reuse observations from the previous terminal.

Add an authority operation that begins a new observation epoch before probes run. It must be legal only when no managed terminal session is active, preserve explicit caller requirements, and reset all observation-derived state to the initial unknown/assumed baseline.

**Completion evidence:** successful-to-failed, terminal-A-to-terminal-B, and partial refresh sequences cannot retain stale mode or keyboard observations.

### HOST-2 — Reject text-incapable Kitty profiles at the managed-TUI boundary

**Status:** Done. **Dependencies:** none.

The protocol layer truthfully permits Kitty progressive-enhancement flag 8 (`report all keys`). The Kitty protocol specifies that this suppresses ordinary text unless flag 16 (`report associated text`) is also enabled. The managed TUI accepts such a profile even though its editable controls consume committed text, so a valid low-level profile can make typing stop.

Keep the low-level protocol type general. At the managed-TUI session-policy decoder, require any all-keys profile to include associated text. This is a behavioral requirement of the TUI, not a restriction on the protocol module.

**Completion evidence:** managed TUI construction rejects flag 8 without flag 16, accepts the text-capable combination, and low-level protocol tests retain the full legal flag space. This follows the [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/).

### HOST-4 — Make terminal reacquisition independent of producer cancellation

**Status:** Done. **Dependencies:** none.

`src/tui/terminal-suspension.ts` uses the effect producer's abort signal for release, the external operation, capability refresh, and reacquisition. Cancellation after terminal release can therefore abort the very recovery required to restore ownership.

Separate cancellable application work from lifecycle recovery. Once the terminal has been released, reacquisition and restoration must run under runtime-owned, bounded recovery authority even if the producing effect is cancelled. Its eventual application result may be discarded; terminal recovery may not be.

**Completion evidence:** cancellation at every suspension phase still restores modes, input, graphics, and rendering ownership; recovery failure follows a bounded fatal path rather than leaving the terminal partially configured.

### HOOK-1 — Decode executable hook results at their actual runtime boundary

**Status:** Done. **Dependencies:** none.

The TUI validates construction input, but later trusts values returned by application code: update results in `src/tui/runtime-store.ts`, effect descriptors/results, subscription source/lifecycle output, and related hook records are consumed structurally without a direct boundary proof. Malformed JavaScript hook output currently fails indirectly or corrupts runtime assumptions.

Introduce small decoders at each executable boundary, typed from `unknown`, which validate exactly the fields the runtime consumes. Validate each returned value once before it enters runtime-owned state. Do not recursively validate application state, enumerate component options for TypeScript exactness, or introduce a generic exact-option framework.

**Completion evidence:** malformed hook result fixtures fail at the originating boundary with useful errors, valid results are adopted once, and trusted downstream code contains no repeated structural guards.

## Wave 1: shared interaction, accessibility, and collection foundations

### QUERY-1 — Prepare deterministic, grapheme-aware collection queries

**Status:** Done. **Dependencies:** none.

`src/ui-model/query.ts` uses default-locale `toLocaleLowerCase()`, returns one enclosing fuzzy range rather than the actual matched spans, and reports UTF-16 offsets. Other components independently use locale-sensitive lowercase and comparison operations. Results can vary by host locale and highlighting can split or over-highlight user-perceived characters.

Prepare the query and each candidate into grapheme units with mappings to original string boundaries. Use a deterministic default case fold; accept an explicit locale only where locale-sensitive behavior is an intentional public input. Fuzzy matching must return the exact non-contiguous, grapheme-aligned ranges. Define an equally deterministic default comparator for user-visible sorting, with explicit locale/collator injection where needed.

**Completion evidence:** Turkish-I, combining-mark, emoji sequence, fuzzy-gap, and locale-independent snapshot tests; no default-locale operation remains in built-in matching or sorting.

### QUERY-2 — Migrate all built-in query consumers to the shared contract

**Status:** Done. **Dependencies:** QUERY-1.

List, tree, document controls, search picker, command suggestions, log search, and table behavior currently have overlapping lowercase, contains, fuzzy, range, and sorting vocabularies. `CollectionWindowDomain.filterQuery` is a string even though `CollectionQuery` carries mode and case policy, so window metadata cannot describe the operation that produced it.

Use the prepared query foundation end to end. Replace `filterQuery` with the owned normalized query contract, or with an opaque query identity if a producer cannot expose semantics. Remove component-local substring implementations rather than wrapping them.

**Completion evidence:** one query fixture matrix runs against every consumer; window metadata round-trips the actual query semantics; no built-in reconstructs a richer query from a bare string.

### A11Y-1 — Add description relationships and focus lifecycle to the semantic model

**Status:** Done. **Dependencies:** none.

`AccessibleNode` supports labels, controls, active descendants, and error messages but not a general `describedBy` relationship. The component runtime also lacks the focus-enter/focus-leave lifecycle needed by trigger-bound descriptions such as tooltips.

Add a validated `describedBy` relationship to accessible nodes and relationship projection. Add a generic focus lifecycle notification at the component boundary; it should report transitions, not create a second focus owner. Validate target existence, scope, and cycles alongside the existing relationships.

**Completion evidence:** accessible graph tests cover valid/missing/cyclic descriptions and focus transition ordering; renderer inspection exposes the relationship without leaking private component state.

### A11Y-2 — Correct field and tooltip relationships

**Status:** Done. **Dependencies:** A11Y-1.

`field()` describes its group but does not directly connect its label/help description to the controlled field. `tooltip()` responds to pointer hover and Escape and has a `focus` reason in its transition type, but it neither opens on trigger focus nor establishes the trigger-to-tooltip description relationship.

Make field label/help/error nodes explicit and attach the relevant relationships to the actual control. Make tooltip augment the trigger's accessible root with `describedBy`, open while its trigger is hovered or focused, remain non-focusable, and dismiss on Escape while focus remains on the trigger.

**Completion evidence:** keyboard-only tooltip tests, combined hover/focus lifetime tests, field label/help/error graph tests, and relationship cleanup when tooltip content disappears. This matches the [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) and [accessible description guidance](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/).

### A11Y-3 — Give toolbar its missing keyboard semantics without owning layout

**Status:** Done. **Dependencies:** NAV-1, A11Y-1.

The current toolbar correctly wraps caller-owned layout and supplies toolbar role/orientation, but it is only semantic metadata. It does not provide the one-tab-stop, roving child focus or orientation-aware Arrow/Home/End behavior expected of a toolbar.

Keep layout caller-owned. Add child focus discovery/routing at the semantic wrapper, skip unavailable controls, apply orientation-aware arrows and Home/End, and preserve the active child across controlled rerenders where possible. Do not introduce a second toolbar layout system.

**Completion evidence:** horizontal/vertical, disabled-child, nested-content, resize, dynamic-child, and focus-entry/exit tests. The keyboard contract should align with the [WAI-ARIA toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/).

### COL-1 — Replace list-view's parallel projection with the measured collection

**Status:** Done. **Dependencies:** NAV-1, SEL-1.

List-view currently has two geometry authorities: each record declares `rowCount` while its retained `Element` is measured again. Its reducer preserves scroll when the active item changes, but component layout silently computes a different reveal offset, leaving caller-owned scroll state stale. The list-view record model also sits outside the shared collection substrate.

Replace the current list-view projection with the existing prepared `MeasuredCollection`/`MeasuredWindow` foundation plus a render-item boundary. The measured collection owns IDs, row counts, prefix geometry, and lookup; rendered child height must equal the indexed height. Active-item reveal must be an explicit reducer transition that returns the new controlled offset, never a layout-only correction.

**Completion evidence:** streamed height changes preserve anchors, off-screen activation returns controlled scroll, declared/rendered height mismatch fails at the component boundary, and visible work is `O(log n + visible items)`.

### COL-2 — Separate prepared tree source from derived visible projection

**Status:** Done. **Dependencies:** NAV-1, SEL-1, QUERY-1.

`treeReducer()` accepts either source nodes or a prepared visible collection. Disclosure needs source nodes; with collection-only input `expandAll` is a no-op, branch/lazy capability cannot be proved, and a query transition can leave the supplied projection stale. Every navigation transition also filters all visible records and rebuilds `CollectionInteractionIndex`.

Introduce one retained prepared tree source containing hierarchy, ID lookup, node capabilities, and owned data. Derive a visible projection from that source and presentation state; the projection retains its selectable interaction index. The reducer always receives the source and its derived projection, rather than an either/or input with different behavior.

**Completion evidence:** raw/prepared parity, disclosure/query/load transitions, duplicate IDs, lazy nodes, selection retention, and `O(1)` lookup/retained-index navigation tests.

### MENU-1 — Make radio menu groups structurally valid

**Status:** Done. **Dependencies:** SEL-1.

Radio menu items validate each `checked` boolean and `groupId` independently, but no boundary enforces one checked item per group. The public model can therefore construct a semantically invalid radio group.

Represent group selection once, preferably on an explicit group record with a selected item ID. If the final menu shape retains item-local checked state, define group scope precisely and enforce at most one checked item per group during menu preparation. Do not rely on render order to resolve conflicts.

**Completion evidence:** nested groups, duplicate IDs, absent selection, disabled selected items, and controlled selection transitions have one unambiguous accessible result.

### LAYOUT-1 — Centralize constrained component-box measurement

**Status:** Done. **Dependencies:** none.

Form/field accept normalized layout-flow constraints, including minimum and maximum sizes, while their component measurement reports unconstrained minima and does not apply the complete contract. Component authors currently have to reconstruct layout constraint behavior manually.

Provide one component-authoring measurement operation for a constrained box: content measurement plus padding/margin/min/max/preferred size and overflow rules. Use it in form, field, and the external-authoring fixtures. Keep row/column track layout separate.

**Completion evidence:** min/max/preferred constraints affect measure and layout consistently at normal and tiny bounds; built-in and external components share the same fixture suite.

## Wave 2: editing, popup composition, and runtime flow

### EDIT-1 — Add bounded, reusable text edit history

**Status:** Done. **Dependencies:** none.

`TextEditBuffer` retains unbounded history arrays/bytes, text area has no equivalent undo/redo state, and current command completion lacks a reusable range replacement operation.

Define a bounded history policy in entries and retained bytes. Store document, caret, and selection snapshots or reversible edits; exclude scroll position. Add a range replacement operation that returns the resulting caret/selection. Coalesce edits only by explicit text-edit rules, not elapsed wall-clock time in deterministic behavior code.

**Completion evidence:** entry/byte eviction, multiline edits, selection replacement, undo/redo branching, Unicode/grapheme positions, and bounded memory property tests.

### EDIT-2 — Refactor command input onto shared multiline editing

**Status:** Done. **Dependencies:** EDIT-1, QUERY-1.

Command history navigation loses the in-progress draft when moving to older submissions and then forward. Suggestion acceptance replaces the complete input instead of applying a completion range. Multiline undo/redo is not shared with text area.

Build command input from the shared text edit operations. Submission history must preserve a separate draft, restore it after the newest history entry, and be independently bounded. Completion candidates supply a replacement range/text and resulting caret. Text area and command input share edit history but retain their own submission and suggestion semantics.

**Completion evidence:** draft restoration, repeated history traversal, multiline selection completion, bounded undo/redo, suggestion refresh, and controlled state round trips.

### POP-1 — Extract narrow popup focus and dismissal policies

**Status:** Done. **Dependencies:** A11Y-1, NAV-1.

The existing popup state covers open/toggle/dismiss, while select, menus, search picker, command input, dialog, and tooltip separately model outside press, Escape, trigger relationships, focus return, active descendants, and scrolling.

Extract composable policies for dismissal, trigger/popup relationship, focus entry/return, and active-descendant ownership. Do not create one mega-state that forces modal dialogs, tooltips, menus, and selection popups to share selection or scroll semantics.

**Completion evidence:** shared conformance fixtures exercise Escape, outside press, trigger removal, focus return, nested popup ownership, and controlled open state across each participating family.

### POP-2 — Converge editable popup inputs after their foundations stabilize

**Status:** Done. **Dependencies:** POP-1, EDIT-1, QUERY-1, SEL-1.

Combobox is select-only, while search picker and command input independently combine editable text, filtered collections, active suggestions, commitment, dismissal, and popup placement. Their state/action vocabularies are incompatible.

Create a behavior-level editable popup-input foundation from shared text editing, prepared query results, active position, selection commitment, and popup policies. Components retain distinct semantic identities and presentations. Do not force menus or non-editable select into editable behavior, and do not preserve the old parallel models as compatibility layers.

**Completion evidence:** combobox autocomplete, search picker, and command suggestions share transition fixtures while preserving their distinct accessible roles and application events.

### RUN-1 — Expose transactional message dispatch

**Status:** Done. **Dependencies:** none.

`runtime-store.ts` already reduces ordered arrays, stops at exit, aggregates effects/cancellations/focus, and the runtime has an internal batch path. The public runtime exposes only single-message dispatch, so consumers cannot request the existing one-reconciliation/one-commit transaction.

Expose `dispatchMany(readonly TMessage[])` with the existing semantics: reduce in order, transcript every message, stop at exit, reconcile subscriptions after the final state, and start/cancel effects only after the commit. An empty batch is a no-op.

**Completion evidence:** equivalence to ordered single reductions, one render commit, exit short-circuit, effect ordering, subscription reconciliation, and transcript ordering.

### RUN-2 — Replace source-wide `latest` with a bounded mixed-delivery channel

**Status:** Done. **Dependencies:** RUN-1.

Event sources currently choose either sequential delivery, which backpressures every message, or one source-wide latest slot, which can discard reliable events. A source cannot combine lossless events with keyed replaceable updates, and no common capacity/overflow metrics make load behavior observable.

Introduce a bounded source channel with two explicit admissions: reliable messages that backpressure at capacity, and replaceable messages coalesced only by caller-supplied key. Drain ordered batches through `dispatchMany`. Define fairness, close/error behavior, capacity, and counters once. Remove source-wide `latest` after consumers migrate.

**Completion evidence:** no loss/reordering of reliable events, independent replacement keys, bounded memory, slow-consumer behavior, close/error races, and deterministic batch drain tests.

### RUN-3 — Add cadence only as an explicit admission policy

**Status:** Done. **Dependencies:** RUN-2.

Every dispatch currently can trigger a full commit. High-rate resize, animation, streaming, and telemetry sources need bounded commit cadence, but implicit global coalescing would alter message/effect semantics and add input latency.

Add an explicitly selected coalesced lane on the mixed-delivery channel. Immediate input, focus, exit, and redraw messages remain immediate. Only producers that declare replaceability/cadence may be held to a configured frame interval; their ordered batch reduction and effect semantics remain those of `dispatchMany`.

**Completion evidence:** bounded commit frequency under high-rate sources, no delay for immediate messages, fair drain under continuous load, and deterministic tests using an injected scheduler/clock.

## Wave 3: renderer and graphics performance boundaries

### FRAME-3 — Separate semantic frame equality from terminal-output equality

**Status:** Done. **Dependencies:** FRAME-1, FRAME-2.

Frame cell equality includes source metadata. Terminal diff planning and fingerprints therefore emit output operations when only inspection/source provenance changed, even though glyph and style are identical.

Keep semantic equality for frame/debug/transcript comparisons. Add terminal-output equality/fingerprints containing only serialized visual state, and use those in row-shift detection and terminal operation planning. Metadata-only changes must still update the canonical frame and inspection indexes; they merely produce no terminal write.

**Completion evidence:** metadata-only transitions update inspection results with zero terminal operations, while all glyph/style/canvas changes remain visible.

### FRAME-4 — Bound render traversal at the point work is performed

**Status:** Done. **Dependencies:** FRAME-1.

Renderer traversal has limits for some frame data but no common budget for component/node depth and count, regions, hit targets, accessibility nodes/relationships, and graphics placements. Recursive or extremely broad application trees can consume unbounded work before frame limits help.

Carry one render budget in the render environment and decrement it while traversing; do not add a separate prewalk. Give each retained structure a relevant count/depth limit and fail with a bounded diagnostic frame/error. Coordinate graphics-placement counts with GFX-1 rather than maintaining conflicting limits.

**Completion evidence:** deep, broad, region-heavy, accessibility-heavy, and hit-target-heavy adversarial trees stop at their exact limit without stack overflow or partial retained state.

### TABLE-1 — Retain inferred table structure or require it explicitly

**Status:** Done. **Dependencies:** none.

When columns are omitted, table preparation scans all rows to infer the maximum cell count on every component construction. This defeats bounded collection rendering and is not meaningful for a window whose unseen rows may have a different shape.

Cache inferred structure on retained complete collections using their identity/version. Require explicit columns for windowed or otherwise unbounded sources. Raw small arrays may retain convenient one-time inference. The explicit-column path must not scan row data.

**Completion evidence:** repeated render/navigation of retained complete data performs no full rescan; windowed construction without columns is rejected; explicit columns remain `O(visible work)`.

### GFX-1 — Enforce one end-to-end graphics resource budget

**Status:** Done. **Dependencies:** none.

Raster construction checks safe dimensions and exact byte length but has no practical pixel/byte ceiling. Capability queries can report arbitrarily large cell-pixel dimensions. Fitting, SIXEL buffers, complete encoded strings, Kitty chunks, placements, and live protocol resources are not governed by one policy.

Define a normalized `GraphicsBudget` at TUI admission covering source pixels/bytes, cell pixel dimensions, fitted output pixels, encoded bytes per upload and commit, placements per frame, and live resources. Enforce each bound immediately before its allocation or retention. Exceeded limits use the image fallback and a bounded diagnostic; do not duplicate different thresholds across raster, protocol, and committer code.

**Completion evidence:** overflow-safe boundary/property tests for every allocation site, malicious capability replies, cumulative frame limits, fallback behavior, and no partial protocol resource retention after rejection.

### GFX-2 — Make Kitty resources content-addressed

**Status:** Done. **Dependencies:** GFX-1.

`RasterImage` already has a content digest, but `graphics-committer.ts` keys uploads by JavaScript object identity. Separate immutable raster objects with identical content are uploaded as different terminal resources and churn during reconstruction.

Key uploaded images by digest plus dimensions and format. Retain placement references separately, reference-count live image resources, and delete an upload only after its final placement disappears. Digest remains a lookup key; equality must include all rendering-relevant fields.

**Completion evidence:** identical reconstructed rasters upload once, digest/shape mismatches never alias, placement churn does not churn uploads, and teardown deletes every resource exactly once.

### GFX-3 — Cache SIXEL encoding and redraw by damage intersection

**Status:** Done. **Dependencies:** GFX-1, FRAME-3.

The SIXEL committer treats any cell diff as a reason to redraw every placement and rebuilds large encoded strings. It does not use the dirty rectangles' intersection with image geometry or retain encoded output.

Cache encoding by image content, crop, destination pixel geometry, composition background/transparency, and transport-relevant parameters. Redraw only placements intersecting dirty output or whose own descriptor changed. Define overlap/clearing order explicitly so damage optimization cannot leave stale pixels.

**Completion evidence:** unrelated text changes do not encode/redraw images; crop/resize/theme-background changes invalidate the right cache entries; overlap and removal tests reproduce the target frame.

### GFX-4 — Establish real-terminal graphics evidence before stabilization

**Status:** Not started. **Dependencies:** GFX-1, GFX-2, GFX-3. **External evidence required:** this workspace is non-TTY (`TERM=dumb`) and has no Kitty, WezTerm, foot, xterm, or tmux executable, so no physical-terminal result can be claimed truthfully.

Current graphics verification is simulator/unit focused. It does not establish upload, placement, deletion, clipping, resize, suspend/resume, tmux transport, failure recovery, or exit cleanup on physical terminal implementations.

Keep graphics explicitly preview until a compatibility matrix covers representative Kitty-protocol terminals (including Kitty, WezTerm, and foot where supported), a SIXEL-capable xterm family, and tmux passthrough. Use optional integration jobs or versioned recorded sessions for environments unavailable in normal CI; do not substitute an emulator-specific allowlist for capability evidence.

**Completion evidence:** documented terminal/version matrix, byte-level session captures, visual/placement assertions where automatable, and failure/recovery tests for each supported transport.

## Wave 4: lifecycle completion and public API stabilization

### HOST-3 — Model Kitty keyboard state per terminal screen

**Status:** Done. **Dependencies:** HOST-1, HOST-2.

Kitty maintains separate keyboard enhancement stacks for the main and alternate screens. The session enters the alternate screen before applying keyboard mode, while `TerminalStateAuthority` models one global profile and can skip a push because an equal profile was observed on the main screen.

Model screen ownership explicitly. After entering the alternate screen, push an application-owned keyboard frame for that screen (including a deliberate legacy/zero-flags frame when enhancements are disabled), verify the enhanced profile when required, and pop it before leaving the alternate screen. Observation equality on one screen must never prove ownership on the other.

**Completion evidence:** main/alternate profiles differ safely; nested pushes, failed verification, suspend/resume, refresh, and teardown restore the correct stack in protocol order. This follows Kitty's documented separate screen stacks and push/pop lifecycle in the [keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/).

### API-1 — Make unavailable/read-only behavior semantically truthful

**Status:** Done. **Dependencies:** SEL-1.

`readOnly` is documented as preserving focus, navigation, selection, and scroll while blocking value changes, but several non-editable families use it mainly to suppress activation, selection commitment, disclosure, or other commands. The same name therefore communicates different capability sets.

Define a small internal action-capability taxonomy covering editing, selection commitment, activation, and structural changes, and test each family against it. Expose `readOnly` only for controls with a meaningful readable value/document. For command-only controls and visualizations, use their semantically appropriate availability/activation contract or remove the option. Do not expose a universal matrix of independent booleans without consumer evidence.

**Completion evidence:** component docs and action unions state exactly which transitions remain; family-level tests cover disabled, inert, read-only, busy, pointer, keyboard, and application-command behavior.

### COL-3 — Remove speculative collection variants until a built-in consumes them

**Status:** Done. **Dependencies:** COL-1, COL-2, QUERY-2.

Sparse/cursor projection, status, sections, estimated rows, and related version/domain fields are currently exercised mainly by their defining module and direct tests, not by built-in components. Meanwhile list-view and tree maintain parallel structures. Publishing the unused variants would stabilize speculative contracts without end-to-end semantics.

After list-view/tree migration, keep only complete/windowed collection forms and metadata actually consumed by a built-in. Remove unused public variants rather than retaining compatibility aliases. Any later sparse, cursor, section, loading, or error model must first be implemented through at least one real component and reducer.

**Completion evidence:** every exported collection field has a catalog consumer and conformance test; unused variants and their isolated tests/docs are removed.

### INSPECT-1 — Move semantic inspection into component definitions

**Status:** Done. **Dependencies:** HOOK-1.

`inspectElement()` currently guesses semantics from prepared-model property names and exposes a broad `state` value. This makes tooling dependent on private model shape, can reveal sensitive content, and changes meaning when an implementation renames a field.

Add an optional definition-owned inspection projection. It returns a bounded, adopted, JSON-safe semantic record; sensitive components explicitly redact. The default inspection reports only generic factory/capability/anatomy information and never serializes the prepared model. Validate the projection as executable hook output once.

**Completion evidence:** renaming private model fields does not change inspection, passwords/secrets cannot appear by default, cyclic/oversized projections fail at the hook boundary, and built-ins expose intentional active/selection/validation/window semantics.

### API-2 — Make entrypoint taxonomy and companion exports coherent

**Status:** Done. **Dependencies:** COL-3, API-1, POP-2, INSPECT-1.

Category entrypoints mix foundations, controls, overlays, application patterns, feedback/status primitives, and visualizations inconsistently. The root directly exports selected preparation helpers such as `prepareCommandSuggestions` and `tableColumn` while comparable companion constructors remain only in behavior or model namespaces.

Classify each public component once by semantic abstraction level, then move exports without compatibility shims while pre-release. Keep the root a deliberate common vertical path; put preparation/index constructors in a coherent behavior or focused subpath. Retain a root companion only when ordinary construction cannot be typed ergonomically without it, and apply that rule consistently.

**Completion evidence:** package-export fixtures can name every public signature from its intended entrypoint; no category duplicates or arbitrary helper exceptions; catalog documentation matches the export map.

### API-3 — Reduce component-authoring repetition after the definition contract is stable

**Status:** Done. **Dependencies:** INSPECT-1, LAYOUT-1, API-2.

The public authoring API provides capability parity but requires extensive generic and hook wiring for common semantic or decorative leaf components. Existing external conformance fixtures demonstrate the repetition.

Add at most a small set of compile-time convenience definitions, such as semantic-leaf and decorative-leaf builders, that compile to the same `defineComponent()` runtime model. They should prefill only genuinely invariant hooks and use the shared constrained measurement and inspection contracts. Do not create a second component kernel or another option schema.

**Completion evidence:** representative external components lose boilerplate while retaining the same inferred options/actions/capabilities and pass the existing authoring parity suite.

### API-4 — Generate a nameable API reference from the actual export graph

**Status:** Done. **Dependencies:** API-2, API-3.

`docs/api/index.md` is an overview rather than a complete declaration reference. The package has many subpath exports, and handwritten duplication would drift.

Generate the reference from emitted declarations and `package.json` exports. Record the owning entrypoint, signature, stability, and source link for each public symbol. Check the generated output in CI or generate it during publication, but keep conceptual guides handwritten.

**Completion evidence:** every package export is documented exactly once, private declarations do not appear, and a stale generated reference fails verification.

### TEST-1 — Expand family-level conformance across the catalog

**Status:** Done. **Dependencies:** NAV-1, SEL-1, A11Y-2, A11Y-3, COL-1, COL-2, POP-1, API-1, API-2.

`tests/conformance/component-authoring-parity.test.mjs` provides useful reusable suites for selected families, but most built-ins are not checked against one matrix for navigation initialization, focus/selection separation, controlled scroll, unavailable states, pointer lifecycle, popup focus, tiny bounds, raw/prepared parity, and variable-height behavior.

Create focused family fixtures rather than one enormous universal suite. Each declared capability maps to a shared set of behavioral and accessibility assertions, run for built-ins and representative external components.

**Completion evidence:** adding a component to a family automatically exercises the common contract; every public catalog family is represented; regression mutations for the confirmed defects fail the relevant fixture.

## Documentation-only correction

### DOC-1 — State the boundary between rich-text hyperlinks and interactive links

**Status:** Done. **Dependencies:** API-2.

`richText()` emits OSC 8 hyperlink metadata and accessible link children, but it has no focus target, hit target, or application activation event. The dedicated `link()` component owns controlled keyboard/pointer activation.

Document rich-text links as terminal-emulator hyperlinks for inline content and `link()` as the application-controlled interactive component. Do not turn rich text into an inline interaction engine without a demonstrated consumer that needs mixed per-span control semantics.

**Completion evidence:** rich-text/link API docs state focus, pointer, accessibility, and activation ownership explicitly.

## Evidence-gated work, not current core implementation

These observations are valid, but the evidence required to select a stable core contract does not yet exist. They remain ledgered as gates rather than implementation commitments.

### INC-1 — Structured document/editor model

**Status:** Not started. **Dependencies:** EDIT-1, EDIT-2 plus a second real consumer.

Terminal UI should not retain arbitrary application elements or import Markdown, syntax, diff, or agent-card domain models. First establish Agent Core's local block model and at least one independent consumer. Only then extract the smallest shared immutable block/document, selection, viewport, and incremental measurement operations proven common.

**Admission evidence:** two consumers with the same editing/measurement operations and no application-specific block semantics in the proposed core contract.

### INC-2 — Hardware scrolling-region optimization

**Status:** Not started; evidence-gated. **Dependencies:** FRAME-3 plus host-specific capability evidence.

The renderer correctly defaults to canonical absolute output unless trustworthy scrolling-region evidence is supplied. Broader use requires host-specific terminfo/profile/query evidence and terminal compatibility testing. Do not enable it by terminal-name allowlist or assumption.

**Admission evidence:** explicit capability provenance, differential replay tests, and physical-terminal evidence across supported hosts.

### INC-3 — Unix job-control suspend/resume adapter

**Status:** Not started; evidence-gated. **Dependencies:** HOST-4 plus Unix PTY evidence.

Generic host signal handling covers termination signals but not the Unix `SIGTSTP`/`SIGCONT` job-control lifecycle. This belongs in a platform adapter built on HOST-4, not in the portable host contract.

**Admission evidence:** Unix PTY integration tests proving release before stop, reacquisition after continue, repeated cycles, and no behavior change on non-Unix hosts.

## Investigated observations not carried into the work graph

These are recorded only to make the four-document reconciliation auditable. They are not confirmed outstanding work:

- **Link context-menu provenance is already present.** `LinkActivateEvent` preserves keyboard or pointer trigger data, including button/modifiers, and `link()` exposes a context-menu path. The application can distinguish primary, modified, middle, and context activation.
- **Toolbar geometry has already been corrected.** The toolbar is a semantic wrapper around caller-owned layout. A new toolbar layout API would recreate solved coupling; only the keyboard semantics in A11Y-3 remain.
- **A generic exact-option validator is rejected.** It would duplicate TypeScript option shapes, reintroduce `optionFields`-style ceremony, and make typed preparation pretend to be an `unknown` decoder. Component-specific JavaScript validation remains appropriate at the one boundary where a component consumes a field; HOOK-1 covers genuinely dynamic return values.
- **Randomized Kitty protocol IDs are not a deterministic-core defect.** They are generated in the effectful terminal boundary to reduce collision with stale resources. Tests may inject an allocator if exact byte transcripts require it, but production IDs need not be deterministic and a globally predictable counter can be less safe.
- **One universal popup state is rejected.** The confirmed duplication is addressed by the composable policies in POP-1; modal dialogs, tooltips, menus, and choice popups should not share irrelevant selection and scrolling state.
- **Immediate structured-document work is rejected.** It remains behind INC-1's evidence gate rather than becoming speculative terminal-ui domain code.
- **Implicit global frame coalescing is rejected.** RUN-3 admits cadence only for explicitly coalescible traffic and preserves immediate input and lifecycle messages.

## External protocol and accessibility references

- [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/): progressive-enhancement flags, associated text, per-screen stacks, and push/pop lifecycle.
- [WAI-ARIA toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): one tab stop and arrow-key navigation among toolbar controls.
- [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/): focus/hover activation, Escape dismissal, and description relationship.
- [WAI-ARIA accessible names and descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/): `aria-describedby` relationship semantics.
