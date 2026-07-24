import {
  createTerminalHarness,
  runInteractionScript,
  type InteractionScript
} from '@ismail-elkorchi/terminal-ui/testing';

const harness = createTerminalHarness({ terminalSize: { columns: 40, rows: 10 } });
const script: InteractionScript = {
  id: 'contract',
  steps: [{ kind: 'input', event: 'x' }, { kind: 'assertOutput', includes: 'x' }]
};
const result = runInteractionScript(harness, script);
type TestingModule = typeof import('@ismail-elkorchi/terminal-ui/testing');

// @ts-expect-error interaction steps are discriminated
const invalidScript: InteractionScript = { id: 'invalid', steps: [{ kind: 'sleep', ms: 1 }] };
// @ts-expect-error resize steps name the terminal-size value explicitly
const removedResizeField: InteractionScript = { id: 'removed-resize', steps: [{ kind: 'resize', viewport: { columns: 20, rows: 4 } }] };
// @ts-expect-error private runtime render results are not part of the testing package
type PrivateRenderResult = TestingModule['InternalRenderResult'];

void result;
void invalidScript;
void removedResizeField;
void (undefined as unknown as PrivateRenderResult);
