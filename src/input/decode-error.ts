export type InputDecodeFailureCode =
  | 'pending_sequence_limit_exceeded'
  | 'paste_limit_exceeded';

export class InputDecodeError extends Error {
  readonly code: InputDecodeFailureCode;
  readonly limit: number;
  readonly received: number;

  constructor(code: InputDecodeFailureCode, limit: number, received: number) {
    super(messageForFailure(code, limit, received));
    this.name = 'InputDecodeError';
    this.code = code;
    this.limit = limit;
    this.received = received;
  }
}

function messageForFailure(code: InputDecodeFailureCode, limit: number, received: number): string {
  const subject = code === 'paste_limit_exceeded' ? 'Bracketed paste' : 'Pending terminal sequence';
  return `${subject} exceeded the configured limit of ${String(limit)} UTF-16 code units (received ${String(received)}).`;
}
