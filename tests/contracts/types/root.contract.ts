import { createTerminalHost, success, type Result } from '@ismail-elkorchi/terminal-ui';

const result: Result<number> = success(42);
const host = createTerminalHost({ runtime: 'memory' });

// @ts-expect-error runtime selectors are a closed contract
createTerminalHost({ runtime: 'browser' });

void result;
void host;
