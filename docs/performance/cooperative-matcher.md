# Shared cooperative work and scalar matching

Collection and text preparation charge one per-preparation budget through nested
work. A numeric checkpoint records scanned/copied units, visited records or
comparisons. Cancellation is checked at each checkpoint; yielding to the host
scheduler is a separate decision. The default operation ceiling is 2048 and the
optional injected monotonic clock supplies a 4 ms advisory time target. A frozen
clock cannot suppress the operation ceiling. There is no ambient foundation
clock and no separate feature scheduler.

`createTuiCooperativeWorkContext(effectContext)` supplies the runtime clock,
signal and scheduler. Synchronous entry points drain the same computations.
Native string searches, normalization of an indivisible grapheme, allocation,
string joins and callbacks can exceed a slice target. Their work is charged after
returning, so these targets are not hard preemption guarantees.

## Matcher representation

- Contains, prefix and exact matching retain scalar score/span information
- Candidate selection keeps the winning field and score, with stable first-field
  ties; it does not build a positions array for every matching field
- Only the winning field produces public UTF-16 offset ranges
- Fuzzy matching computes the score without a positions array and reconstructs
  the winner directly into final contiguous ranges
- A bounded ASCII native specialization feeds the same scoring, winner and range
  path as general Unicode matching. Its scalar scratch is preparation-local
- One query-local scalar cursor is reused across the scan. Bounded ASCII fields
  allocate no per-candidate/per-field generators or progress-result objects;
  continuation state is saved only at suspension or for a winner. Completed
  short records share checkpoints near 1,024 charged units; an incomplete
  record still exposes its bounded 256-unit checkpoint
- A single large record remains interruptible across its fields. Native ASCII
  search/folding is limited to fields of at most 2,048 units (and native scoring
  to queries of at most 32 units); one indivisible call may exceed the checkpoint
  target, and its full charge is preserved
- Long/Unicode scoring and folding retain cooperative continuations. Cancellation
  closes active continuations, and concurrent readers can safely admit a folded
  index while another cursor is suspended
- Compiled query data is resolved once for a candidate scan
- Bottom-up stable sorting reuses two arrays across all merge passes
- ASCII folds occupy compact strings in the existing field cache. A domain
  adapter requesting an index promotes that same slot to one stable descriptor;
  there is no second cache. Unicode folds retain the original offset table
- Raw token lengths reject impossible fields before folding. Index construction
  retains the maximum secondary token length, allowing an impossible secondary
  group to be skipped without walking it

## Owned readers and field preparation

Owned-source scans use a depth-bounded private cursor and one reusable iterator
result per query. Public iterables retain native `for...of` semantics. Both feed
one matching computation; there is no second matcher or flattened corpus cache.
Picker/listbox result preparation carries the winning source references through
the same stable merge kernel as match records. Its optional reference buffers
are preparation-local, and their movement/finalization is charged. Public match
records retain their original shape.

Short printable-ASCII cleaning uses a bounded runtime check; general text retains
the shared sanitizer and source-boundary path. All fields then use the canonical
index-admission path. An experimental fused admission path reduced construction
cost but slowed warmed source matching, so it was removed rather than retained as
an alternate implementation. ASCII index construction does not perform redundant
Unicode normalization. These are shared synchronous/cooperative computations,
not a caller-supplied trusted-input flag.

The latest application measurements and trade-offs are in
[the incident workbench report](incident-workbench.md). The measurements below
record earlier matcher revisions and are not final whole-application timings.

## Allocation evidence

A deterministic case with 2,000 candidates, two matching fields each, and the
six-character query `needle` was compared with commit `922a4d1` on Node 24.19.0.
After source/query construction, the baseline matcher called `Array.from` 4,000
times per scan, creating 24,000 temporary position slots. The scalar matcher
creates none of those arrays or slots. Both produce 2,000 final one-range arrays.
This is covered by a focused regression in `src/text/query.test.ts`.

The first scalar implementation still allocated a generator per candidate and
emitted a result for each field checkpoint. Whole-application profiling exposed
that cost even though a smaller, two-matching-field allocation fixture improved.
Removing temporary position arrays alone was insufficient; evidence from one
fixture must not be generalized to the entire application.

A follow-up comparison on 2026-10-02 used 20,000 candidates with five short ASCII
fields, a case-insensitive contains query `critical`, and 2,858 matching records.
Each candidate had an incident description plus status, owner, region and
priority fields. Twenty warm-up scans preceded 40 uninstrumented timing scans;
40 additional scans were measured separately with V8 allocation sampling at a
16,384-byte interval, including objects collected by minor and major GC.

| Matcher | Sampled allocation, 40 scans | Median scan |
| --- | ---: | ---: |
| `922a4d1` baseline | 266.2 MiB | 8.15 ms |
| Initial scalar, per-candidate generator | 529.7 MiB | 12.45 ms |
| Initial reusable scalar cursor | 66.4 MiB | 8.63 ms |

The initial scalar version attributed 416.3 MiB to `matchCandidateWork`; the
initial cursor eliminated that allocation site from the collection path. Its
first, uncached scan emitted 10,001 checkpoints versus 222,858, while charged work
increased from 3,323,496 to 3,543,496 units as cursor/setup visits were included.
Cached scans continue charging searched characters; the reduction does not come
from discarding search or folding charges. These measurements predate the compact
folded slots and reduced continuation-state writes described above.

A subsequent source-level probe used the incident workbench's 100,000-record,
five-field shape and the 20 contains queries `trace-42100` through `trace-42119`.
After five warm-up passes over those queries, two measured passes reported median
scan times of 39.29 ms for the initial cursor, 18.79 ms after compact folding and
scalar-local completion, and 19.86 ms for the baseline. Each query produced one
match. These are matcher-only timings over the reproduced field data, excluding
construction, source traversal, scheduler, rendering and other application work;
they are not substitutes for end-to-end workbench measurements.

These samples describe this fixture and Node 24.19.0 environment, not a portable
timing gate or a claim about whole-process RSS, all Unicode/fuzzy workloads or
end-to-end application latency. The baseline query module was taken from the
named commit and used the same source-index dependencies for this bounded-ASCII
fixture. Allocation sampling totals vary between runs; application-level timing
and allocation comparisons remain separate evidence.

## Correctness and cancellation evidence

Focused tests compare synchronous and cooperative results across all four modes,
case-sensitive and folded tokens, combining marks, emoji, stable candidate/field
ties, empty queries, and concurrent preparation. Long-field cancellation returns
no candidate. Narrow regressions also assert cold/cached field charge floors,
checkpoint batching, cancellation within a record containing 4,097 bounded
fields, producer finalization, and a suspended Unicode fold resumed after a
synchronous reader admits the cached field. Further regressions verify in-place
ASCII cache promotion during adapter/query interleaving and reject impossible
lengths without case folding. Driver tests cover shared nested budgets, frozen clocks, advisory
time slices, cancellation without a scheduler turn, scheduler failure, generator
finalization, invalid charges, and stable sorting. Existing owned-source tests
cover interleaved synchronous readers, preparation cancellation/resumption and
Unicode boundary/geometry reuse.
