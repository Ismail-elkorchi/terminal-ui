import {
  createTerminalHarness,
  runInteractionScript,
  type InteractionScript
} from '@ismail-elkorchi/terminal-ui/testing';

const harness = createTerminalHarness({ viewport: { columns: 40, rows: 10 } });
const script: InteractionScript = {
  id: 'contract',
  steps: [{ kind: 'input', event: 'x' }, { kind: 'assertOutput', includes: 'x' }]
};
const result = runInteractionScript(harness, script);
type TestingModule = typeof import('@ismail-elkorchi/terminal-ui/testing');

// @ts-expect-error interaction steps are discriminated
const invalidScript: InteractionScript = { id: 'invalid', steps: [{ kind: 'sleep', ms: 1 }] };
// @ts-expect-error private render projections are not part of the testing package
type PrivateRenderProjection = TestingModule['RenderElementProjection'];

void result;
void invalidScript;
void (undefined as unknown as PrivateRenderProjection);
