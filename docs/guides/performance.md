# Measure performance

Build first, then run `npm run benchmark:interactive`. The report separates
view construction, layout, visible rendering, diffing, output planning, host
writes, input-to-commit, and resize storms. It records p50, p95, median absolute
deviation, and sample count alongside a Node/platform key.

```sh
npm run benchmark:baseline -- --output baseline.json
npm run benchmark:interactive -- --output current.json
npm run benchmark:compare -- current.json baseline.json
```

Compare reports from the same runtime key, scenario, and terminal size.
`benchmark:compare` always checks structural work bounds. It compares timings
only when both reports have at least 20 samples and their coefficient of
variation is at most `0.2`. A timing failure requires a p95 increase larger
than 0.25 ms, 25 percent, or six baseline median absolute deviations.
Heap deltas are supporting evidence because they vary between runs.

The search fixtures assert that the requested query produces matches and
visible highlights. These synchronous benchmark fixtures explicitly prepare
results in their element-construction scenario, so picker candidate counters
include that preparation; missing or zero candidate evidence fails the structural
gate. Segmentation
counters report text processed for geometry and the portion measured when clipping;
they do not count literal Intl iterator calls. Source boundaries can be reused even
when a different width policy requires new geometry.
Snapshot counters report rebuilt final-frame rows and cells.

The runtime retains paint commands for framework leaf components and spans for
unchanged table rows. Paint dependencies include geometry, theme, width profile,
styles and interaction state. Hit targets and callbacks are refreshed on redraw.
Custom painters execute on every render unless they explicitly opt into the
immutable-input retainPaint contract. Cache checks compare declared geometry and
style fields plus owned model/resource identities; they never walk arbitrary
application data. Immutable cells can be shared without sharing mutable buffers.

Log searches use compact text indexes and lazily create case-folded tokens.
Applications explicitly prepare `LogViewerView` values in cancellable effects
with `prepareLogViewerView()`. Query matching and wrapped geometry yield in
batches through the supplied scheduler. Applications accept current completions
through their existing update lifecycle and pass the resulting view to rendering
and navigation. Pending or stale results never trigger a synchronous scan in
component construction, rendering or reducers. Large preparation still takes
time proportional to the searched history; editing and cancellation can continue
while it runs.

`createLogViewerView()`, `createTreeView()` and `querySearchPickerIndex()` are
explicit synchronous preparation APIs for small fixed inputs, snapshots and
isolated benchmarks. Direct rendering consumes already prepared results.
Unwrapped log and editor geometry is independent of viewport width, and editor
text indexes are created when a line is used. For application-owned concurrent
preparation, see [prepared queries](./tui.md#prepared-queries).

For CPU and memory comparisons, run each case in a fresh process after building,
without concurrent builds or tests. Measure cold startup separately from warmed
updates, and compare CPU at the same requested update rate. Report RSS alongside
heap and external allocations after GC; RSS alone is not evidence of a leak.
Completed application updates per second measure commit throughput. Visible FPS
also depends on the terminal emulator, compositor and display.

When diagnosing a slow interaction, identify whether time is spent building
the tree/index, painting visible cells, or writing terminal output. A local
frame change can avoid rebuilding layout while still requiring diff and host
work. Scrolling scenarios cover text areas, log viewers, tables, and trees.
Hosts with `scrollRegion` support can emit a region move plus repair when it
uses fewer bytes than the canonical diff; replay still uses that canonical
diff.
