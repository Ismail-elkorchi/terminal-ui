import type { TerminalInputChunk } from '../host/index.ts';

export interface Utf8StreamDecoder {
  decode(chunk: TerminalInputChunk): string;
  flush(): string;
  reset(): void;
}

export function createUtf8StreamDecoder(): Utf8StreamDecoder {
  let decoder = new TextDecoder();
  let trailingHighSurrogate = '';
  let expectedContinuations = 0;

  return {
    decode(chunk) {
      if (typeof chunk.data === 'string') {
        const prefix = decoder.decode();
        decoder = new TextDecoder();
        expectedContinuations = 0;
        const value = trailingHighSurrogate + chunk.data;
        const last = value.charCodeAt(value.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) {
          trailingHighSurrogate = value.at(-1) ?? '';
          return prefix + value.slice(0, -1);
        }
        trailingHighSurrogate = '';
        return prefix + value;
      }
      if (trailingHighSurrogate.length > 0) {
        const prefix = trailingHighSurrogate;
        trailingHighSurrogate = '';
        return prefix + decoder.decode(normalizeRawC1(chunk.data), { stream: true });
      }
      return decoder.decode(normalizeRawC1(chunk.data), { stream: true });
    },
    flush() {
      const text = decoder.decode() + trailingHighSurrogate;
      decoder = new TextDecoder();
      trailingHighSurrogate = '';
      expectedContinuations = 0;
      return text;
    },
    reset() {
      decoder = new TextDecoder();
      trailingHighSurrogate = '';
      expectedContinuations = 0;
    }
  };

  function normalizeRawC1(bytes: Uint8Array): Uint8Array {
    let changed = false;
    const result: number[] = [];
    for (const byte of bytes) {
      if (expectedContinuations > 0 && byte >= 0x80 && byte <= 0xbf) {
        expectedContinuations -= 1;
        result.push(byte);
        continue;
      }
      expectedContinuations = utf8ContinuationCount(byte);
      if (byte >= 0x80 && byte <= 0x9f && expectedContinuations === 0) {
        result.push(0xc2, byte);
        changed = true;
      } else {
        result.push(byte);
      }
    }
    return changed ? Uint8Array.from(result) : bytes;
  }
}

export function decodeUtf8Chunk(chunk: TerminalInputChunk): string {
  if (typeof chunk.data === 'string') return chunk.data;
  const bytes: number[] = [];
  let expectedContinuations = 0;
  for (const byte of chunk.data) {
    if (expectedContinuations > 0 && byte >= 0x80 && byte <= 0xbf) {
      expectedContinuations -= 1;
      bytes.push(byte);
      continue;
    }
    expectedContinuations = utf8ContinuationCount(byte);
    if (byte >= 0x80 && byte <= 0x9f && expectedContinuations === 0) bytes.push(0xc2, byte);
    else bytes.push(byte);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function utf8ContinuationCount(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) return 1;
  if (byte >= 0xe0 && byte <= 0xef) return 2;
  if (byte >= 0xf0 && byte <= 0xf4) return 3;
  return 0;
}
