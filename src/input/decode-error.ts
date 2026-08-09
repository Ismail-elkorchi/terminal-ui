export type InputDecodeFailureCode =
  | 'host_chunk_limit_exceeded'
  | 'protocol_token_limit_exceeded'
  | 'text_event_limit_exceeded'
  | 'event_batch_limit_exceeded'
  | 'paste_limit_exceeded'
  | 'kitty_text_limit_exceeded'
  | 'mouse_field_limit_exceeded';

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
  const subject: Record<InputDecodeFailureCode, string> = {
    host_chunk_limit_exceeded: 'Terminal input chunk',
    protocol_token_limit_exceeded: 'Terminal protocol token',
    text_event_limit_exceeded: 'Terminal text event',
    event_batch_limit_exceeded: 'Decoded input event batch',
    paste_limit_exceeded: 'Bracketed paste',
    kitty_text_limit_exceeded: 'Kitty associated text',
    mouse_field_limit_exceeded: 'Mouse numeric field'
  };
  return `${subject[code]} exceeded the configured limit of ${String(limit)} (received ${String(received)}).`;
}
