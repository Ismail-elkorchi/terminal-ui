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
visible highlights. Picker candidate counters include element construction;
missing or zero candidate evidence fails the structural gate. Segmentation
counters report cache misses and the portion actually measured when clipping.
Snapshot counters report rebuilt final-frame rows and cells.

The runtime retains paint commands for framework leaf components and spans for
unchanged table rows. Paint dependencies include geometry, theme, width profile,
styles and interaction state. Hit targets and callbacks are refreshed on redraw.
Custom painters execute on every render. Immutable cells and row fingerprints
can be shared across frames without sharing mutable buffers.

Log searches use compact text indexes and lazily create case-folded tokens.
The runtime prepares results in batches using the host clock, checking
cancellation between batches. The frame commits after preparation completes;
large searches still take time proportional to the searched history. Direct
rendering remains synchronous. Unwrapped log and editor geometry is independent
of viewport width, and editor text indexes are created when a line is used.

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
