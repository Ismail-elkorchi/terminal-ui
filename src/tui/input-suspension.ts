interface InputSuspensionRequest {
  readonly paused: () => void;
  readonly pauseFailed: (cause: unknown) => void;
  readonly resumeRequested: Promise<void>;
  readonly resumed: () => void;
}

export interface InputSuspensionLease {
  readonly paused: Promise<void>;
  resume(): Promise<void>;
  cancel(): boolean;
}

export class TuiInputSuspensionController {
  readonly #queued: ManagedInputSuspensionRequest[] = [];
  #waiting: ((request: ManagedInputSuspensionRequest) => void) | undefined;
  #closed = false;

  request(): InputSuspensionLease {
    if (this.#closed) {
      return {
        paused: Promise.reject(new Error('TUI input suspension is unavailable after the input loop ends.')),
        resume: () => Promise.resolve(),
        cancel: () => true
      };
    }
    const paused = Promise.withResolvers<undefined>();
    const resume = Promise.withResolvers<undefined>();
    const resumed = Promise.withResolvers<undefined>();
    let resumeRequested = false;
    let delivered = false;
    const request: ManagedInputSuspensionRequest = {
      paused: () => { paused.resolve(undefined); },
      pauseFailed: (cause) => {
        paused.reject(cause);
        resumed.resolve(undefined);
      },
      resumeRequested: resume.promise,
      resumed: () => { resumed.resolve(undefined); },
      delivered: () => { delivered = true; }
    };
    const waiting = this.#waiting;
    if (waiting === undefined) this.#queued.push(request);
    else {
      this.#waiting = undefined;
      waiting(request);
    }
    return {
      paused: paused.promise,
      resume: async () => {
        if (!resumeRequested) {
          resumeRequested = true;
          resume.resolve(undefined);
        }
        await resumed.promise;
      },
      cancel: () => {
        if (delivered) return false;
        const queuedIndex = this.#queued.indexOf(request);
        if (queuedIndex >= 0) this.#queued.splice(queuedIndex, 1);
        paused.resolve(undefined);
        resumed.resolve(undefined);
        return true;
      }
    };
  }

  next(): Promise<InputSuspensionRequest> {
    const queued = this.#queued.shift();
    if (queued !== undefined) {
      queued.delivered();
      return Promise.resolve(queued);
    }
    if (this.#closed) return new Promise(() => undefined);
    return new Promise((resolve) => {
      this.#waiting = (request) => {
        request.delivered();
        resolve(request);
      };
    });
  }

  close(): void {
    this.#closed = true;
    const failure = new Error('TUI input loop ended during terminal suspension.');
    for (const request of this.#queued.splice(0)) request.pauseFailed(failure);
    this.#waiting = undefined;
  }
}

interface ManagedInputSuspensionRequest extends InputSuspensionRequest {
  readonly delivered: () => void;
}

export type { InputSuspensionRequest };
