import type { TerminalInputChunk } from '../host/index.ts';

export interface Utf8StreamDecoder {
  decode(chunk: TerminalInputChunk): string;
  flush(): string;
  reset(): void;
}

export function createUtf8StreamDecoder(): Utf8StreamDecoder {
  let decoder = new TextDecoder();

  return {
    decode(chunk) {
      if (typeof chunk.data === 'string') {
        const prefix = decoder.decode();
        decoder = new TextDecoder();
        return prefix + chunk.data;
      }
      return decoder.decode(chunk.data, { stream: true });
    },
    flush() {
      const text = decoder.decode();
      decoder = new TextDecoder();
      return text;
    },
    reset() {
      decoder = new TextDecoder();
    }
  };
}

export function decodeUtf8Chunk(chunk: TerminalInputChunk): string {
  return typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data);
}
