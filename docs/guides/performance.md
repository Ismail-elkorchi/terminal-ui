# Performance Evidence

`npm run benchmark:interactive` measures terminal-ui after a clean build. It
uses deterministic scenario data, a fixed viewport, the default theme, and one
explicit text-width profile. Warmup iterations are discarded. Sample output
contains p50, p95, standard deviation, median absolute deviation, and
coefficient of variation for renderer stages, diffing, output planning, host
writes, input-to-commit, and resize storms.

Use `node scripts/benchmark-interactive.mjs --output report.json` after a build
to retain a report. Every report includes a runtime key composed from the Node
version, platform, and architecture. Compare only reports with compatible
runtime keys and scenario metadata. Heap deltas are noisy supporting evidence,
not pass/fail thresholds.

CI checks structural bounds and verifies that the evidence harness executes. It
does not impose universal millisecond limits. A timing regression becomes
actionable only when:

1. the same scenario and scale regresses on repeated compatible runs;
2. the p95 change exceeds observed run-to-run variability;
3. stage measurements identify an owner rather than only a slower total;
4. a user-visible interaction or documented scale is affected.

Optimization proposals must record the baseline, hypothesis, changed owner,
after-measurement, invalidation tests, and complexity cost. Retained rendering
or caches are not justified by total render time alone.
