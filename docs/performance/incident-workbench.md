# Incident workbench

Run `npm run build && node examples/tui/incident-workbench.ts` in a terminal
(at least 72×18). The fixture contains 100,000 deterministic incidents across
three queues, eight services and 31 regions. It is synthetic incident data,
not a production integration.

- Navigate queues, inspect the virtualized incident grid and resolve an incident
- Enter `/palette` in the command bar to search incidents or application commands;
  try `trace-42123`, then Enter to inspect the matching record
- Use the Issues, Activity and Notes tabs; Notes is a real editable text document
- The queue tree remaps next/previous to `j`/`k`; the palette remaps them to
  Ctrl+N/Ctrl+P. Help text comes from the same reusable keymap objects
- `/resolve`, `/issues`, `/activity`, `/notes` and Ctrl+Q operate the workspace

Edits and resolutions are in memory. The example does not write user files.
Queue arrays and table collections are retained rather than rebuilt on every
keystroke. The large search index is constructed once at startup.

## Responsive query integration

The small-data synchronous search-picker API remains available. This example
opts into explicit pending/result ownership:

1. `createSearchPickerState({queryResult: null, ...}, index)` avoids an initial
   synchronous query. The reducer and component also receive `queryResult`
2. Text editing commits immediately with `queryResult: null`. The dialog shows
   “Searching…” and has no actionable stale results
3. A replaceable TUI effect calls `prepareSearchPickerQuery` with its abort signal
   and a `setImmediate` yield, allowing new input between work batches
4. Completion installs the result only if its revision is still current. Escape
   replaces the effect and invalidates its revision. Enter cannot accept a
   pending result

The query performs the same full-corpus matching. Cooperative scheduling and
an additional feedback frame trade throughput for responsiveness; they do not
make the CPU work disappear.

## Verification and measurements

`node --test tests/integration/incident-workbench.test.mjs` covers large search,
record selection and resolution, mouse/keyboard tabs, editable notes, dismissal
during a query, remapped navigation and resize.

Run the benchmark after building:

```sh
node scripts/performance/benchmark-workbench.mjs /tmp/workbench.json
WORKBENCH_WRITE_DELAY_MS=5 node scripts/performance/benchmark-workbench.mjs /tmp/workbench-slow.json
```

Each run has 24 measured new queries after two warmups, followed by 24 rapid
superseding-input pairs. Each complete query arrives as one decoded text event (not a per-character
typing trace). Queries are unique and uncached; dataset/index/startup
cost is excluded. The timer for the second input is registered before issuing
the first input, so event-loop blocking is included. Every final result must
select the exact expected incident ID. The benchmark reports raw samples,
p50/p95/max, environment and whole-process memory (including retained host
frames). A 5ms delay is applied to each host write in the slow-output case.

The baseline uses the actual `ec483837ceb2411fa6a5953d365aa5ee7b81cb92`
runtime, with the same dataset, cached collections, application layout and
benchmark. Only the synchronous versus effect-owned search integration and
keymap/help configuration differ. The baseline application snapshot is retained
at `tests/fixtures/performance/incident-workbench-baseline.ts`. To reproduce,
archive that commit into a separate checkout, install its dependencies, copy
that snapshot to `examples/tui/incident-workbench.ts`, copy the current benchmark
script, build, and run the commands above. Do not run baseline and after at the
same time.

Measured on 2026-09-30; milliseconds, p50 / p95 / maximum:

| Host | Measurement | Baseline | Cooperative |
| --- | --- | ---: | ---: |
| Memory | First committed feedback | 96.4 / 153.7 / 271.6 | 34.5 / 57.5 / 57.8 |
| Memory | Final matching frame | 96.4 / 153.7 / 271.7 | 128.6 / 164.0 / 194.3 |
| Memory | Superseding input event-loop delay | 93.9 / 105.6 / 120.6 | 31.7 / 38.5 / 96.4 |
| Memory | Superseding input to final matching frame | 216.2 / 253.3 / 286.5 | 190.2 / 271.0 / 363.4 |
| 5ms/write | First committed feedback | 95.7 / 112.6 / 207.0 | 38.9 / 55.4 / 61.5 |
| 5ms/write | Final matching frame | 95.7 / 112.6 / 207.0 | 147.8 / 177.2 / 188.9 |
| 5ms/write | Superseding input event-loop delay | 92.8 / 97.8 / 99.5 | 32.2 / 43.8 / 168.5 |
| 5ms/write | Superseding input to final matching frame | 232.3 / 243.8 / 295.4 | 216.6 / 291.0 / 378.2 |

First feedback and input admission improve; final-result latency is higher in
these samples. Superseding-query tails are noisy and do not show a universal
improvement. Whole-process RSS is also higher in the cooperative run; this
harness retains every memory-host frame, including the extra pending frames,
so these numbers cannot establish a leak or isolate library-only heap usage. Raw evidence preserves
the memory values and every sample.

Evidence: [baseline](./workbench-baseline.json), [cooperative](./workbench-after.json),
[baseline with delayed writes](./workbench-baseline-slow.json),
[cooperative with delayed writes](./workbench-after-slow.json),
[PTY smoke](./workbench-pty.json).

These are memory-host input-to-committed-frame results, not physical terminal
presentation latency. The shared Linux x64 cloud machine used Node v24.19.0 and
an AMD EPYC 9V74; CPU load was not isolated. Polling for completion adds roughly
1ms plus scheduling delay. The Unix PTY smoke separately verified startup,
`/palette`, `trace-42123` producing `INC-042123`, Enter and a clean Ctrl+Q exit at
120×40. It does not emulate terminal pixels or establish hardware latency.
