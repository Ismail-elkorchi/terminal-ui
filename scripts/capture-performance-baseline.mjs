import { spawn } from 'node:child_process';
import process from 'node:process';

const outputIndex = process.argv.indexOf('--output');
const output = outputIndex < 0 ? undefined : process.argv[outputIndex + 1];
if (output === undefined || output.length === 0) {
  throw new TypeError('Usage: npm run benchmark:baseline -- --output PATH');
}
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/benchmark-interactive.mjs', '--output', output], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  child.once('error', reject);
  child.once('close', resolve);
});
if (code !== 0) process.exitCode = code ?? 1;
