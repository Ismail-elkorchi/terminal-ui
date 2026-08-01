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
const wheelEvent: InputEvent = {
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'wheel',
  button: 'wheelDown',
  row: 1,
  column: 1,
  rawCode: 65,
  modifiers: { shift: false, alt: false, ctrl: false },
  deltaRows: 1,
  deltaColumns: 0
};

// @ts-expect-error wheel events require finite-delta fields in their static shape
const incompleteWheelEvent: InputEvent = {
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'wheel',
  button: 'wheelDown',
  row: 1,
  column: 1,
  rawCode: 65,
  modifiers: { shift: false, alt: false, ctrl: false }
};

const invalidWheelButton: InputEvent = {
  kind: 'mouse',
  sequence: '',
  encoding: 'sgr',
  action: 'wheel',
  // @ts-expect-error wheel events require a wheel-compatible button
  button: 'left',
  row: 1,
  column: 1,
  rawCode: 65,
  modifiers: { shift: false, alt: false, ctrl: false },
  deltaRows: 1,
  deltaColumns: 0
};

// @ts-expect-error unknown is not a bindable key name
const invalidTrigger: InputTrigger = { kind: 'key', key: 'unknown' };

void matches;
void codePointTrigger;
void physicalTrigger;
void resizeEvent;
void wheelEvent;
void incompleteWheelEvent;
void invalidWheelButton;
void invalidTrigger;
