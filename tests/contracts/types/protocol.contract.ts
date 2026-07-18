import {
  createProtocolWriter,
  kittyKeyboardProfile,
  type MouseReportingMode,
  type TerminalProtocolSink
} from '@ismail-elkorchi/terminal-ui/protocol';

const sink: TerminalProtocolSink = {
  write: (value) => {
    void value;
    return Promise.resolve();
  }
};
const writer = createProtocolWriter(sink);
const keyboard = kittyKeyboardProfile(24);
const mode: MouseReportingMode = 'drag';

// @ts-expect-error protocol modes are explicit
const invalidMode: MouseReportingMode = 'motion';

void writer;
void keyboard;
void mode;
void invalidMode;
