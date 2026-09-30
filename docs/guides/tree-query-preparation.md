# Preparing large tree queries

`tree()` leaves matching, row projection, collection identity and navigation-index
construction to runtime preparation. Work yields through the host scheduler and
observes its abort signal. Synchronous snapshot rendering and `createTreeView()`
remain synchronous APIs.

For an application that must accept edits while a large query is running, prepare
in a cancellable application effect:

```ts
import { prepareTreeView, type TreeState } from '@ismail-elkorchi/terminal-ui/behavior';
import type { TreeSource, TreeView } from '@ismail-elkorchi/terminal-ui';

export async function prepareDesiredTree(
  source: TreeSource,
  desiredTreeState: TreeState,
  effectSignal: AbortSignal,
  schedulerYield: (signal: AbortSignal) => Promise<void>,
): Promise<TreeView> {
  return await prepareTreeView(source, desiredTreeState, {
    signal: effectSignal,
    yield: () => schedulerYield(effectSignal),
  });
}
```

`prepareTreeView` is exported from the behavior entrypoint. The application should
keep its displayed state separate from its draft query, abort superseded effects,
and publish the displayed state and prepared view together only if the effect's
generation is still current. Pass that view to `treeReducer` through its `view`
option. Passing `view: null` deliberately makes navigation idle while preparation
is pending; query edits and disclosure transitions remain available. A view for
a different source, query, expansion or lazy-load state is rejected.

The component reuses the resulting projection from the cache. Cancelling work
never publishes partial rows. Source creation and defensive copies of caller-owned
expansion/load-state arrays are synchronous setup; this API does not move source
construction off-thread.

## Reproduce the measurement

The benchmark uses Node's real event loop and 50,000 matching leaf nodes under one
branch. It excludes source construction, runs 24 cold projections, and schedules
an independent event-loop turn before each query. Each trial creates a fresh tree
source before starting the clock; it has no retained query projection. Source
sanitization and module/JIT caches are allowed to warm naturally in both versions. It measures software scheduling
latency, not a physical key press, terminal transport, rendering or display latency.

```sh
node scripts/performance/benchmark-tree-preparation.mjs

# Optional comparison with the pre-change source
baseline=$(mktemp -d)
git archive ec483837ceb2411fa6a5953d365aa5ee7b81cb92 src | tar -x -C "$baseline"
printf '{"type":"module"}\n' > "$baseline/package.json"
node scripts/performance/benchmark-tree-preparation.mjs --baseline-root "$baseline"
```

The script reads TypeScript sources directly using Node 24's type stripping, so a
build and installed package artifacts are not required. Its JSON output includes
all trials, chunk durations, navigation timings and cancellation timings.

Raw trial data: [tree-query-preparation.json](../performance/tree-query-preparation.json).

### Observed sample

Node v24.19.0, Linux, 24 trials on September 30, 2026, compared with commit
`ec483837ceb2411fa6a5953d365aa5ee7b81cb92`:

| Metric | Before | Cooperative preparation |
| --- | ---: | ---: |
| Median delay before the scheduled event-loop turn | 195.07 ms | 1.16 ms |
| p95 delay before the scheduled event-loop turn | 226.65 ms | 13.14 ms |
| Median total query/projection time | 187.62 ms | 189.49 ms |
| Median time for 1,000 prepared navigation moves | 62.96 ms | 53.32 ms |
| Scheduler yields per cold projection | 0 | 975 |

Across the cooperative trials, per-trial p95 work-slice duration was 0.63–1.07 ms;
the largest observed slice was 6.15 ms. Once cancellation was delivered, the
preparation rejected within 0.04–0.16 ms. Request-to-rejection varied from
0.88–8.40 ms, including event-loop scheduling. Every completed trial produced
50,001 rows.

The result trades a small amount of total throughput for substantially lower
input scheduling delay. These are observations from one run, not portable latency
guarantees. Scheduler contention, garbage collection, input text length and tree
shape affect timings.

Regression tests cover cancellation during scanning, row projection, collection
ownership and interaction indexing; overlapping old/new queries; stale prepared
views; runtime disposal without partial output; ordering, ancestors, disabled
nodes, lazy placeholders and committed selection.
