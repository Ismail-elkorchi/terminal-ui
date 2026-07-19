import type { TerminalSignal, Unsubscribe } from './types.ts';

export type SignalSubscriber = (listener: (signal: TerminalSignal) => void) => Unsubscribe;

export interface DenoSignalRuntime {
  addSignalListener?(signal: string, handler: () => void): void;
  removeSignalListener?(signal: string, handler: () => void): void;
}

export function denoSignalSubscriber(runtime: DenoSignalRuntime | undefined): SignalSubscriber | undefined {
  if (
    typeof runtime?.addSignalListener !== 'function'
    || typeof runtime.removeSignalListener !== 'function'
  ) return undefined;

  return (listener) => subscribeMappedSignals(
    [
      ['SIGINT', 'SIGINT'],
      ['SIGTERM', 'SIGTERM'],
      ['SIGHUP', 'SIGHUP'],
      ['SIGWINCH', 'resize']
    ],
    (signal, handler) => { runtime.addSignalListener?.(signal, handler); },
    (signal, handler) => { runtime.removeSignalListener?.(signal, handler); },
    listener
  );
}

export interface ProcessSignalRuntime {
  on?(signal: string, handler: () => void): void;
  off?(signal: string, handler: () => void): void;
}

export function processSignalSubscriber(runtime: ProcessSignalRuntime | undefined): SignalSubscriber | undefined {
  if (typeof runtime?.on !== 'function' || typeof runtime.off !== 'function') return undefined;
  return (listener) => subscribeMappedSignals(
    [
      ['SIGINT', 'SIGINT'],
      ['SIGTERM', 'SIGTERM'],
      ['SIGHUP', 'SIGHUP'],
      ['SIGWINCH', 'resize']
    ],
    (signal, handler) => { runtime.on?.(signal, handler); },
    (signal, handler) => { runtime.off?.(signal, handler); },
    listener
  );
}

function subscribeMappedSignals(
  mappings: readonly (readonly [string, TerminalSignal])[],
  add: (signal: string, handler: () => void) => void,
  remove: (signal: string, handler: () => void) => void,
  listener: (signal: TerminalSignal) => void
): Unsubscribe {
  const installed: { readonly signal: string; readonly handler: () => void }[] = [];
  for (const [signal, mapped] of mappings) {
    const handler = (): void => { listener(mapped); };
    try {
      add(signal, handler);
      installed.push({ signal, handler });
    } catch {
      // Platform-specific signal absence is represented by the missing installation.
    }
  }
  return () => {
    for (const item of installed.reverse()) {
      try {
        remove(item.signal, item.handler);
      } catch {
        // Unsubscription is best effort for a signal source that is already disappearing.
      }
    }
  };
}
