import type { TerminalDiagnostic } from '../diagnostics.ts';
import { diagnostic } from '../diagnostics.ts';
import type { TerminalHost, TerminalSession } from '../host/types.ts';
import type { PromptResult } from './types.ts';

export class PromptCleanupFailure extends Error {
  readonly primary: unknown;
  readonly cleanup: unknown;

  constructor(primary: unknown, cleanup: unknown) {
    super('Prompt work and input cleanup both failed.');
    this.primary = primary;
    this.cleanup = cleanup;
  }
}

export function raisePromptCleanupFailure(primary: unknown, cleanup: unknown, hasPrimary: boolean): never {
  if (hasPrimary) throw new PromptCleanupFailure(primary, cleanup);
  throw cleanup;
}

export class PromptTaskOwner {
  readonly #controller = new AbortController();
  readonly #diagnostics: TerminalDiagnostic[] = [];
  #publication: Promise<void> = Promise.resolve();
  #failure: unknown;
  #failed = false;
  #settled = false;
  #wakeFailure!: (cause: unknown) => void;
  readonly #failureSignal = new Promise<unknown>((resolve) => { this.#wakeFailure = resolve; });
  #active = true;
  bracketedPaste = false;

  get signal(): AbortSignal { return this.#controller.signal; }
  get active(): boolean { return this.#active; }
  get failure(): unknown { return this.#failure; }
  get failed(): boolean { return this.#failed; }
  get diagnostics(): readonly TerminalDiagnostic[] { return this.#diagnostics; }

  async setup(session: TerminalSession): Promise<void> {
    const raw = await session.enableRawInput();
    this.#recordOperation(raw);
    const paste = await session.enableBracketedPaste();
    this.#recordOperation(paste);
    this.bracketedPaste = paste.status === 'applied';
  }

  #recordOperation(result: Awaited<ReturnType<TerminalSession['enableRawInput']>>): void {
    if (result.status === 'applied') this.#diagnostics.push(...result.diagnostics);
    else this.#diagnostics.push(result.diagnostic, ...result.diagnostics);
  }

  fail(cause: unknown): void {
    if (this.#settled || this.#failed) return;
    this.#failed = true;
    this.#failure = cause;
    this.#controller.abort(cause);
    this.#wakeFailure(cause);
  }

  track(work: () => Promise<void>): void {
    if (!this.#active) return;
    void Promise.resolve().then(() => this.#runTracked(work))
      .catch((cause: unknown) => { this.#failBackground(cause); });
  }

  async #runTracked(work: () => Promise<void>): Promise<void> {
    if (this.#active) await work();
  }

  #failBackground(cause: unknown): void {
    if (this.#active) this.fail(cause);
  }

  async wait<T>(work: Promise<T>): Promise<T> {
    this.#throwIfFailed();
    const outcome = await Promise.race([
      work.then((value) => ({ kind: 'value' as const, value })),
      this.#failureSignal.then((cause) => ({ kind: 'failure' as const, cause }))
    ]);
    if (outcome.kind === 'failure') throw outcome.cause;
    this.#throwIfFailed();
    return outcome.value;
  }

  #throwIfFailed(): void {
    if (this.#failed) throw this.#failure;
  }

  publish(work: () => Promise<void>): Promise<void> {
    if (!this.#active || this.#failed) return Promise.resolve();
    const next = this.#publication.then(async () => {
      if (this.#active && !this.#failed) await work();
    });
    this.#publication = next.catch((cause: unknown) => { this.fail(cause); });
    return this.#publication;
  }

  async close(): Promise<void> {
    this.#active = false;
    this.#controller.abort();
    await this.#publication;
    this.#settled = true;
  }
}

export async function runOwnedPrompt<T>(
  host: TerminalHost | undefined,
  id: string,
  run: (owner: PromptTaskOwner) => Promise<PromptResult<T>>,
  failed: (cause: unknown) => PromptResult<T>,
  interactive: boolean
): Promise<PromptResult<T>> {
  const session = interactive ? await host?.beginSession({ id }) : undefined;
  const owner = new PromptTaskOwner();
  const cleanupDiagnostics: TerminalDiagnostic[] = [];
  let result: PromptResult<T>;
  try {
    if (session !== undefined) await owner.setup(session);
    result = await owner.wait(run(owner));
  } catch (cause) {
    let primary = cause;
    while (primary instanceof PromptCleanupFailure) {
      cleanupDiagnostics.push(diagnostic('HOST_STREAM_CLOSED', 'Prompt input cleanup failed.', {
        cause: primary.cleanup, target: id
      }));
      primary = primary.primary;
    }
    result = failed(primary);
  } finally {
    await owner.close();
  }
  if (owner.failed) result = failed(owner.failure);
  let restoreDiagnostics: readonly TerminalDiagnostic[] = [];
  if (session !== undefined) {
    try {
      restoreDiagnostics = (await session.restore(restoreReasonForPrompt(result))).diagnostics;
    } catch (cause) {
      restoreDiagnostics = [diagnostic('HOST_RESTORE_FAILED', 'Prompt terminal restoration failed.', { cause, target: id })];
    }
  }
  return { ...result, diagnostics: [
    ...result.diagnostics, ...cleanupDiagnostics, ...owner.diagnostics, ...restoreDiagnostics
  ] };
}

export function restoreReasonForPrompt(result: PromptResult<unknown>): 'success' | 'cancelled' | 'interrupted' | 'timeout' | 'error' {
  if (result.status === 'submitted') return 'success';
  switch (result.reason) {
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    case 'timeout':
      return 'timeout';
    case 'validation_failed':
    case 'host_error':
    case 'non_tty_denied':
      return 'error';
  }
}
