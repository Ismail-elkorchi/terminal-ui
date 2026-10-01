import process from 'node:process';
import { pathToFileURL } from 'node:url';

const probePath = process.argv[2];
if (probePath === undefined) throw new Error('Graphics bootstrap requires a probe path.');
// Keep the existing probe's argv contract, and consume only the launcher's Enter.
process.argv.splice(1, 1);
const start = new Promise((resolve) => process.stdin.once('data', resolve));
process.stdout.write('\u001b[48;2;0;255;0mTERMINAL_UI_EMULATOR_BOOTSTRAP\u001b[0m\n');
await start;
process.stdin.pause();
await import(pathToFileURL(probePath).href);
