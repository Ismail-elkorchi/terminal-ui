import {
  createInputDecoder,
  matchesInputTrigger,
  type InputEvent,
  type InputTrigger
} from '@ismail-elkorchi/terminal-ui/input';

const decoder = createInputDecoder();
const event: InputEvent = decoder.decode({ data: '\r' }).events[0] ?? { kind: 'end' };
const trigger: InputTrigger = { kind: 'key', key: 'enter' };
const matches = matchesInputTrigger(trigger, event);
const codePointTrigger: InputTrigger = { kind: 'codePoint', codePoint: 97, source: 'shifted' };
const physicalTrigger: InputTrigger = { kind: 'physicalKey', codePoint: 113, location: 'standard' };
const resizeEvent: InputEvent = { kind: 'resize', terminalSize: { columns: 80, rows: 24 } };

// @ts-expect-error unknown is not a bindable key name
const invalidTrigger: InputTrigger = { kind: 'key', key: 'unknown' };

void matches;
void codePointTrigger;
void physicalTrigger;
void resizeEvent;
void invalidTrigger;
