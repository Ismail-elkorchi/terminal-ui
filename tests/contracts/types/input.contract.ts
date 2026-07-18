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

// @ts-expect-error unknown is not a bindable key name
const invalidTrigger: InputTrigger = { kind: 'key', key: 'unknown' };

void matches;
void invalidTrigger;
