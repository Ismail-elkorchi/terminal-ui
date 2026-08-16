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
  let refreshQueued = false;
  const diagnostics = {
    values: () => [...occurrences],
    omitted: () => omittedOccurrences,
    record,
    report(item: TerminalDiagnostic) {
      const occurrence = record(item);
      if (options.active() && options.canRefresh() && !refreshQueued) {
        refreshQueued = true;
        track(options.refresh(), 'diagnostic_refresh', () => {
          refreshQueued = false;
        });
      }
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
