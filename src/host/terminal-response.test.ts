import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findTerminalResponse,
  incompleteTerminalResponseStart
} from './terminal-response.ts';
import type { TerminalResponseProtocol } from './terminal-response.ts';

const escape = 0x1b;
const textEncoder = new TextEncoder();

void test('terminal response framing keeps supported control-string families atomic', () => {
  const controls = [
    bytes(escape, 0x5b, 0x3f, 0x31, 0x63),
    bytes(escape, 0x5d, ...ascii('title'), 0x07),
    bytes(escape, 0x50, ...ascii('payload'), escape, 0x5c),
    bytes(escape, 0x58, ...ascii('payload'), escape, 0x5c),
    bytes(escape, 0x5e, ...ascii('payload'), escape, 0x5c),
    bytes(escape, 0x5f, ...ascii('payload'), escape, 0x5c),
    bytes(0x9b, 0x3f, 0x31, 0x63),
    bytes(0x9d, ...ascii('title'), 0x9c),
    bytes(0x90, ...ascii('payload'), 0x9c),
    bytes(0x98, ...ascii('payload'), 0x9c),
    bytes(0x9e, ...ascii('payload'), 0x9c),
    bytes(0x9f, ...ascii('payload'), 0x9c)
  ];

  for (const control of controls) {
    const protocol: TerminalResponseProtocol<number> = {
      classify: (candidate) => equalBytes(candidate, control)
        ? { kind: 'matched', value: candidate.byteLength }
        : undefined
    };
    const input = concatenate(textEncoder.encode('before'), control, textEncoder.encode('after'));
    const result = findTerminalResponse(input, 0, protocol);

    assert.equal(result.kind, 'matched');
    assert.equal(result.start, 6);
    assert.equal(result.end, 6 + control.byteLength);
    assert.equal(result.value, control.byteLength);
  }
});

void test('terminal response framing identifies incomplete split controls', () => {
  const prefix = concatenate(textEncoder.encode('typed'), bytes(escape, 0x50), textEncoder.encode('partial'));
  assert.equal(incompleteTerminalResponseStart(prefix), 5);
});

function ascii(value: string): number[] {
  return [...textEncoder.encode(value)];
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index]);
}
