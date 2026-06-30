import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/tui';

import { runShowcaseScript, showcaseViewport } from './app.mjs';

const messages = [
  { input: '/dispatch\r' },
  { kind: 'route', route: 'data' },
  { kind: 'row', row: 3 },
  { kind: 'route', route: 'text' },
  { kind: 'command', value: '/palette' },
  { kind: 'palette', open: true },
  { kind: 'palette', open: false },
  { kind: 'route', route: 'diagram' },
  { kind: 'context', open: true },
  { kind: 'context', open: false },
  { kind: 'route', route: 'forms' },
  { kind: 'modal', open: true },
  { kind: 'modal', open: false },
  { kind: 'route', route: 'activity' },
  { kind: 'activity', index: 2 },
  { kind: 'inspector', inspector: 'event' },
  { kind: 'tick' },
  { kind: 'theme' }
];

const result = await runShowcaseScript(messages, { viewport: showcaseViewport });
const finalFrame = result.frames.at(-1);

if (finalFrame === undefined || result.state === undefined) {
  throw new Error('Showcase script did not produce a final frame.');
}

console.log('Northstar Control scripted tour');
console.log(`frames: ${String(result.frames.length)}`);
console.log(`final route: ${result.state.selectedRoute}`);
console.log(`final inspector: ${result.state.selectedInspector}`);
console.log(`theme index: ${String(result.state.themeIndex)}`);
console.log(`host frames: ${String(result.host.frames().length)}`);
console.log(`host diffs: ${String(result.host.diffs().length)}`);
console.log('input command: /dispatch');
console.log(`hit targets: ${String(finalFrame.hitTargets?.length ?? 0)}`);
console.log(`focus path: ${(finalFrame.focusPath ?? []).join(' > ')}`);
console.log('');
console.log(renderFramePlain(finalFrame));
