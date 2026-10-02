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
keystroke. The owned search descriptors are adopted once; the index is constructed cooperatively
when the picker opens and retained in its child state after acceptance.

## Responsive query integration

The small-data synchronous search-picker API remains available. This example
opts into explicit pending/result ownership:

1. The ordinary picker child uses separate prepared queries for source construction
   and matching. Typing during construction updates current input without restarting
   the index. The accepted index is reused on later queries and reopening
2. Text editing commits immediately with `queryResult: null`. The dialog shows
   “Searching…” and has no actionable stale results
3. A replaceable TUI effect calls `prepareSearchPickerQuery` with its abort signal
   and the host clock's zero-delay yield, allowing new input between work batches
4. Completion installs the result only if its revision and child lifetime are current.
   Escape cancels construction and query work and invalidates their revisions. Enter cannot accept a
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

Each run has 24 measured whole-query events after two warmups, 24 rapid
superseding-input pairs, and 24 character-by-character typing traces with Escape.
The default sample count is configurable through WORKBENCH_SAMPLES (minimum 20).
Module setup, initial frame, first picker feedback and first accepted index/query
are reported separately. Steady-state samples use unique, uncached queries.

The timer for a superseding input is registered before issuing the first input,
so event-loop blocking is included. Every final result must select the exact
expected incident ID; every character must be reflected in current input, in order.
The benchmark reports raw samples, p50/p95/max and whole-process memory. It
discards historical observer frames/output rather than retaining a growing test
transcript. A 5ms delay is applied to each host write in the slow-output case.

The native Node clock supplies real cooperative yields with memory-backed output.
No terminal emulator or physical presentation latency is measured. Run baseline
and candidate sequentially in fresh processes without concurrent builds/tests.

## Controlled ownership and construction (2026-10-02)

This comparison uses main at `67e54bbe86cfb5f2d5a89504e714c38d657b67ed`
and the controlled-ownership implementation in this revision. Both use the
same current benchmark, with the baseline adapter reading its older child-state
shape. Twenty samples per scenario ran sequentially, in fresh Node v24.19.0
processes, on the same shared Linux x64 cloud host. These are committed-frame
measurements, not physical display latency.

The single cold run reached its initial frame in 432ms including module setup,
versus 1378ms before. Index construction is deferred and interruptible: opening
the picker first showed feedback in 117ms and finished in 1823ms, versus 88ms and
261ms with the baseline's already-built index. Total module-to-first-search
readiness was therefore slower (about 2255ms versus 1640ms), while the application
became available much earlier.

Milliseconds, p50 / p95, warmed unique queries:

| Measurement | Baseline | Controlled ownership |
| --- | ---: | ---: |
| Character to committed feedback |38.0 /49.6|37.3 /47.0|
| Whole query to final matching frame |138.1 /158.2|133.0 /154.6|
| Escape to committed feedback |28.4 /35.8|27.1 /34.3|
| Superseding input event-loop delay |37.9 /48.8|43.1 /56.3|
| Character feedback with 5ms/write |43.0 /51.1|43.3 /53.6|
| Final matching frame with 5ms/write |152.5 /164.7|140.8 /163.6|

This is not a universal latency improvement. Some input/tail measurements
regressed, and both runs still had roughly 1.6-second worst-case character
outliers. The raw samples preserve those observations; no 16ms or hard scheduling
guarantee is claimed. Construction, search and cancellation use the same owned
effect lifecycle, without debouncing or dropping character events.

Structural tests additionally verify that large prepared queries are not
recompiled during matching or painting, and that cold/resize log painting only
processes the visible source window. A 100k-character log probe reduced cold
unwrapped paint from 109ms to 16ms and resize paint from 76ms to 2.8ms. Wrapped resize
paint was 2.2ms with 12ms cooperative preparation measured separately. Native
operations, input adoption and a single custom measurement callback remain
explicit indivisible cost cases.

Evidence: [baseline](./workbench-controlled-baseline.json),
[controlled](./workbench-controlled-after.json),
[baseline with delayed writes](./workbench-controlled-baseline-slow.json),
[controlled with delayed writes](./workbench-controlled-after-slow.json),
[real PTY smoke](./workbench-controlled-pty.json).
The measured-feed example also exercises 10,000 variable-height items with
scrolling, resizing and cancellation through public APIs.

## Historical initial query integration

The following 2026-09-30 evidence used the earlier whole-query-only benchmark,
which retained memory-host frames. It is not directly comparable to the current
character-by-character or constructor measurements.

The baseline uses the actual `ec483837ceb2411fa6a5953d365aa5ee7b81cb92`
runtime, with the same dataset, cached collections, application layout and
benchmark. Only the synchronous versus effect-owned search integration and
keymap/help configuration differ. The baseline application snapshot is retained
at `tests/fixtures/performance/incident-workbench-baseline.ts`. To reproduce,
archive that commit into a separate checkout, install its dependencies, copy
that snapshot to `examples/tui/incident-workbench.ts`, copy the benchmark script from that measured revision, build, and run the commands above. Do not run baseline and after at the
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
