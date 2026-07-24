# Performance Evidence

`npm run benchmark:interactive` measures terminal-ui after a clean build. It
uses deterministic scenario data, a fixed terminal size, the default theme, and one
explicit text-width profile. Warmup iterations are discarded. Sample output
contains p50, p95, standard deviation, median absolute deviation, and
coefficient of variation for renderer stages, diffing, output planning, host
writes, input-to-commit, and resize storms.

Use `node scripts/benchmark-interactive.mjs --output report.json` after a build
to retain a report. Every report includes a runtime key composed from the Node
version, platform, and architecture. Compare only reports with compatible
runtime keys and scenario metadata. Heap deltas are noisy supporting evidence,
not pass/fail thresholds.

Capture a local timing baseline with:

```sh
npm run benchmark:baseline -- --output baseline.json
```

After a change, capture a report on the same runtime and terminal size, then compare
it with:

```sh
npm run benchmark:interactive -- --output current.json
npm run benchmark:compare -- current.json baseline.json
```

`benchmark:compare` always enforces deterministic structural budgets. Timing is
compared only for stages with at least 20 samples in both reports and a
coefficient of variation no greater than `0.2`. A stage fails when its p95
exceeds the baseline by more than the greatest of 0.25 ms, 25 percent, or six
baseline median absolute deviations. Baselines are local evidence tied to the
reported runtime key; they are not committed cross-host thresholds.

CI checks structural bounds and verifies that the evidence harness executes. It
does not impose universal millisecond limits. A timing regression becomes
actionable only when:

1. the same scenario and scale regresses on repeated compatible runs;
2. the p95 change exceeds observed run-to-run variability;
3. stage measurements identify the slower stage rather than only a slower total;
4. a user-visible interaction or documented scale is affected.

Optimization proposals must record the baseline, hypothesis, changed subsystem,
after-measurement, invalidation tests, and complexity cost. Retained rendering
or caches are not justified by total render time alone.

Scrolling benchmarks cover text areas, log viewers, tables, and trees as
controlled one-row viewport transitions. On terminals with explicit
`scrollRegion` support, runtime output planning compares the canonical absolute
diff with a scrolling-region move plus canonical repair and emits only the
smaller plan. The canonical diff remains the replay and transcript authority.
