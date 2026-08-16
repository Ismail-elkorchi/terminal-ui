import { createDiagnosticOccurrenceReporter, diagnostic } from '../diagnostics.ts';
import type { DiagnosticOccurrence, TerminalDiagnostic } from '../diagnostics.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';

interface TrackedRuntimeTask {
  completion: Promise<void>;
}

const runtimeDiagnosticLimit = 256;

export function createRuntimeDiagnostics(options: {
  readonly owner: string;
  readonly initial?: readonly TerminalDiagnostic[];
  readonly transcript?: TranscriptRecorder;
  readonly active: () => boolean;
  readonly canRefresh: () => boolean;
  readonly refresh: () => Promise<void>;
}) {
  const reporter = createDiagnosticOccurrenceReporter(`${options.owner}:runtime`);
  const occurrences: DiagnosticOccurrence[] = [];
  let omittedOccurrences = 0;
  const backgroundTasks = new Set<TrackedRuntimeTask>();
  let reportedGeneration = 0;
  let renderedGeneration = 0;
  let refreshRunning = false;
  const diagnostics = {
    values: () => [...occurrences],
    omitted: () => omittedOccurrences,
    record,
    report(item: TerminalDiagnostic) {
      const occurrence = record(item);
      reportedGeneration += 1;
      ensureRefresh();
      return occurrence;
    },
    async settle() {
      await Promise.allSettled([...backgroundTasks].map((task) => task.completion));
    }
  };
  for (const item of options.initial ?? []) diagnostics.record(item);
  return diagnostics;

  function record(item: TerminalDiagnostic): DiagnosticOccurrence {
    const occurrence = reporter.report(item);
    if (occurrences.length === runtimeDiagnosticLimit) {
      occurrences.shift();
      omittedOccurrences += 1;
    }
    occurrences.push(occurrence);
    try {
      options.transcript?.recordDiagnostic(occurrence);
    } catch (cause) {
      const sinkFailure = reporter.report(diagnostic(
        'TRANSCRIPT_SINK_FAILED',
        'Transcript diagnostic sink failed.',
        { severity: 'warning', target: options.owner, cause }
      ));
      if (occurrences.length === runtimeDiagnosticLimit) {
        occurrences.shift();
        omittedOccurrences += 1;
      }
      occurrences.push(sinkFailure);
    }
    return occurrence;
  }

  function ensureRefresh(): void {
    if (
      refreshRunning
      || renderedGeneration >= reportedGeneration
      || !options.active()
      || !options.canRefresh()
    ) return;
    refreshRunning = true;
    track(refreshLoop(), 'diagnostic_refresh', () => {
      refreshRunning = false;
      ensureRefresh();
    });
  }

  async function refreshLoop(): Promise<void> {
    while (
      renderedGeneration < reportedGeneration
      && options.active()
      && options.canRefresh()
    ) {
      const targetGeneration = reportedGeneration;
      try {
        await options.refresh();
      } finally {
        // A failed redraw is retried only when a later diagnostic advances the generation.
        renderedGeneration = targetGeneration;
      }
    }
  }

  function track(task: Promise<unknown>, taskName: string, settled: () => void): void {
    const tracked: TrackedRuntimeTask = { completion: Promise.resolve() };
    tracked.completion = (async () => {
      try {
        await task;
      } catch (cause) {
        if (options.active()) {
          record(diagnostic('TUI_RUNTIME_TASK_FAILED', `TUI runtime task ${taskName} failed.`, {
            target: options.owner,
            cause,
            data: { taskName }
          }));
        }
      } finally {
        settled();
        backgroundTasks.delete(tracked);
      }
    })();
    backgroundTasks.add(tracked);
  }
}
