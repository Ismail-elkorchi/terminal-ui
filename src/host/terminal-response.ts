export type TerminalResponseClassification<TValue> =
  | { readonly kind: 'matched'; readonly value: TValue }
  | { readonly kind: 'fence' }
  | { readonly kind: 'consume' };

export interface TerminalResponseProtocol<TValue> {
  classify(control: Uint8Array): TerminalResponseClassification<TValue> | undefined;
}

export type TerminalResponseSearch<TValue> =
  | {
      readonly kind: 'matched';
      readonly start: number;
      readonly end: number;
      readonly value: TValue;
      readonly nextStart: number;
    }
  | {
      readonly kind: 'fence';
      readonly start: number;
      readonly end: number;
      readonly nextStart: number;
    }
  | {
      readonly kind: 'consume';
      readonly start: number;
      readonly end: number;
      readonly nextStart: number;
    }
  | {
      readonly kind: 'pending';
      readonly nextStart: number;
    };

export function findTerminalResponse<TValue>(
  bytes: Uint8Array,
  startAt: number,
  protocol: TerminalResponseProtocol<TValue>
): TerminalResponseSearch<TValue> {
  let cursor = Math.max(0, startAt);
  while (cursor < bytes.byteLength) {
    const framed = frameControlAt(bytes, cursor);
    if (framed === undefined) {
      cursor += 1;
      continue;
    }
    if (framed.kind === 'pending') return { kind: 'pending', nextStart: framed.start };
    const classification = protocol.classify(bytes.subarray(framed.start, framed.end));
    if (classification?.kind === 'matched') {
      return {
        kind: 'matched',
        start: framed.start,
        end: framed.end,
        value: classification.value,
        nextStart: framed.end
      };
    }
    if (classification?.kind === 'fence') {
      return {
        kind: 'fence',
        start: framed.start,
        end: framed.end,
        nextStart: framed.end
      };
    }
    if (classification?.kind === 'consume') {
      return {
        kind: 'consume',
        start: framed.start,
        end: framed.end,
        nextStart: framed.end
      };
    }
    cursor = framed.end;
  }
  return { kind: 'pending', nextStart: cursor };
}

export function incompleteTerminalResponseStart(bytes: Uint8Array): number | undefined {
  for (let cursor = 0; cursor < bytes.byteLength; cursor += 1) {
    const framed = frameControlAt(bytes, cursor);
    if (framed === undefined) continue;
    if (framed.kind === 'pending') return framed.start;
    cursor = framed.end - 1;
  }
  return undefined;
}

export function csiBody(control: Uint8Array): Uint8Array | undefined {
  if (control[0] === csi8) return control.subarray(1);
  return control[0] === escape && control[1] === leftBracket
    ? control.subarray(2)
    : undefined;
}

type FramedControl =
  | { readonly kind: 'complete'; readonly start: number; readonly end: number }
  | { readonly kind: 'pending'; readonly start: number };

function frameControlAt(bytes: Uint8Array, start: number): FramedControl | undefined {
  const first = bytes[start];
  if (first === escape) {
    const second = bytes[start + 1];
    if (second === undefined) return { kind: 'pending', start };
    if (second === leftBracket) return frameCsi(bytes, start, start + 2);
    if (second === rightBracket) return frameString(bytes, start, start + 2, true);
    if (second === uppercaseP || second === uppercaseX || second === caret || second === underscore) {
      return frameString(bytes, start, start + 2, false);
    }
    return { kind: 'complete', start, end: start + 2 };
  }
  if (first === csi8) return frameCsi(bytes, start, start + 1);
  if (first === osc8) return frameString(bytes, start, start + 1, true);
  if (first === dcs8 || first === sos8 || first === pm8 || first === apc8) {
    return frameString(bytes, start, start + 1, false);
  }
  return undefined;
}

function frameCsi(bytes: Uint8Array, start: number, bodyStart: number): FramedControl {
  for (let cursor = bodyStart; cursor < bytes.byteLength; cursor += 1) {
    const byte = bytes[cursor];
    if (byte !== undefined && byte >= 0x40 && byte <= 0x7e) {
      return { kind: 'complete', start, end: cursor + 1 };
    }
  }
  return { kind: 'pending', start };
}

function frameString(
  bytes: Uint8Array,
  start: number,
  bodyStart: number,
  bellTerminates: boolean
): FramedControl {
  for (let cursor = bodyStart; cursor < bytes.byteLength; cursor += 1) {
    const byte = bytes[cursor];
    if (bellTerminates && byte === bell) return { kind: 'complete', start, end: cursor + 1 };
    if (byte === stringTerminator8) return { kind: 'complete', start, end: cursor + 1 };
    if (byte === escape) {
      if (bytes[cursor + 1] === backslash) return { kind: 'complete', start, end: cursor + 2 };
      if (cursor + 1 >= bytes.byteLength) return { kind: 'pending', start };
    }
  }
  return { kind: 'pending', start };
}

const escape = 0x1b;
const bell = 0x07;
const leftBracket = 0x5b;
const rightBracket = 0x5d;
const uppercaseP = 0x50;
const uppercaseX = 0x58;
const caret = 0x5e;
const underscore = 0x5f;
const backslash = 0x5c;
const dcs8 = 0x90;
const sos8 = 0x98;
const csi8 = 0x9b;
const stringTerminator8 = 0x9c;
const osc8 = 0x9d;
const pm8 = 0x9e;
const apc8 = 0x9f;
