export interface ProducerAdmissionLease {
  readonly producer: 'effect' | 'subscription';
  readonly id: string;
  readonly signal: AbortSignal;
  authorized(): boolean;
  revoke(): void;
}

export function createProducerAdmissionLease(
  producer: ProducerAdmissionLease['producer'],
  id: string,
  signal: AbortSignal
): ProducerAdmissionLease {
  let authorized = !signal.aborted;
  const abort = (): void => {
    authorized = false;
  };
  signal.addEventListener('abort', abort, { once: true });
  return {
    producer,
    id,
    signal,
    authorized: () => authorized && !signal.aborted,
    revoke() {
      if (!authorized) return;
      authorized = false;
      signal.removeEventListener('abort', abort);
    }
  };
}
