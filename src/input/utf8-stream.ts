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
    const initialContinuations = expectedContinuations;
    let extraBytes = 0;
    for (const byte of bytes) {
      if (expectedContinuations > 0 && byte >= 0x80 && byte <= 0xbf) {
        expectedContinuations -= 1;
        continue;
      }
      expectedContinuations = utf8ContinuationCount(byte);
      if (byte >= 0x80 && byte <= 0x9f && expectedContinuations === 0) {
        extraBytes += 1;
      }
    }
    if (extraBytes === 0) return bytes;
    return expandRawC1(bytes, initialContinuations, extraBytes);
  }
}

export function decodeUtf8Chunk(chunk: TerminalInputChunk): string {
  if (typeof chunk.data === 'string') return chunk.data;
  let extraBytes = 0;
  let expectedContinuations = 0;
  for (const byte of chunk.data) {
    if (expectedContinuations > 0 && byte >= 0x80 && byte <= 0xbf) {
      expectedContinuations -= 1;
      continue;
    }
    expectedContinuations = utf8ContinuationCount(byte);
    if (byte >= 0x80 && byte <= 0x9f && expectedContinuations === 0) extraBytes += 1;
  }
  return new TextDecoder().decode(extraBytes === 0 ? chunk.data : expandRawC1(chunk.data, 0, extraBytes));
}

function expandRawC1(bytes: Uint8Array, initialContinuations: number, extraBytes: number): Uint8Array {
  const result = new Uint8Array(bytes.length + extraBytes);
  let expectedContinuations = initialContinuations;
  let output = 0;
  for (const byte of bytes) {
    if (expectedContinuations > 0 && byte >= 0x80 && byte <= 0xbf) {
      expectedContinuations -= 1;
      result[output++] = byte;
      continue;
    }
    expectedContinuations = utf8ContinuationCount(byte);
    if (byte >= 0x80 && byte <= 0x9f && expectedContinuations === 0) result[output++] = 0xc2;
    result[output++] = byte;
  }
  return result;
}

function utf8ContinuationCount(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) return 1;
  if (byte >= 0xe0 && byte <= 0xef) return 2;
  if (byte >= 0xf0 && byte <= 0xf4) return 3;
  return 0;
}
