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

When diagnosing a slow interaction, identify whether time is spent building
the tree/index, painting visible cells, or writing terminal output. A local
frame change can avoid rebuilding layout while still requiring diff and host
work. Scrolling scenarios cover text areas, log viewers, tables, and trees.
Hosts with `scrollRegion` support can emit a region move plus repair when it
uses fewer bytes than the canonical diff; replay still uses that canonical
diff.
