import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const kittyVersion = '0.48.2';
const archiveSha256 = '967a1958e7fc67b495d279c0963bcd1a0482097151817ce6506fabc822689af7';
const archiveByteLength = 32_024_932;
const archiveUrl = `https://github.com/kovidgoyal/kitty/releases/download/v${kittyVersion}/kitty-${kittyVersion}-x86_64.txz`;

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('The pinned Kitty conformance binary supports only Linux x64 runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/install-kitty-emulator.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await fs.mkdir(destination, { recursive: true });
const existing = await fs.readdir(destination);
if (existing.length > 0) {
  throw new Error(`Kitty destination must be empty: ${destination}`);
}

const response = await fetch(archiveUrl, { redirect: 'follow' });
if (!response.ok) {
  throw new Error(`Kitty download failed with HTTP ${String(response.status)}.`);
}
const archive = new Uint8Array(await response.arrayBuffer());
if (archive.byteLength !== archiveByteLength) {
  throw new Error(`Kitty archive size mismatch: expected ${String(archiveByteLength)}, received ${String(archive.byteLength)}.`);
}
const actualSha256 = createHash('sha256').update(archive).digest('hex');
if (actualSha256 !== archiveSha256) {
  throw new Error(`Kitty archive checksum mismatch: expected ${archiveSha256}, received ${actualSha256}.`);
}

const archivePath = path.join(destination, `kitty-${kittyVersion}.txz`);
await fs.writeFile(archivePath, archive, { mode: 0o600 });
try {
  await run('tar', ['-xJf', archivePath, '-C', destination]);
} finally {
  await fs.unlink(archivePath).catch(() => undefined);
}

await fs.access(path.join(destination, 'bin', 'kitty'));
await fs.access(path.join(destination, 'bin', 'kitten'));
console.log(`Installed Kitty ${kittyVersion} at ${destination}`);

async function run(command, arguments_) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}.`));
    });
  });
}
