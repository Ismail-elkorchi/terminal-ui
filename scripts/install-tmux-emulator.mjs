import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const tmuxVersion = '3.7c';
const archiveSha256 = '7c60cae9a0e25288e2e24750aafc9e8800fc7fd4555e447e1b29ee4201cfb3bf';
const archiveByteLength = 789_431;
const archiveUrl = `https://github.com/tmux/tmux/releases/download/${tmuxVersion}/tmux-${tmuxVersion}.tar.gz`;

if (process.platform !== 'linux') {
  throw new Error('The pinned tmux conformance build supports only Linux runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/install-tmux-emulator.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-tmux-build-'));
try {
  const archive = await downloadVerifiedArchive();
  const archivePath = path.join(temporary, `tmux-${tmuxVersion}.tar.gz`);
  await fs.writeFile(archivePath, archive, { mode: 0o600 });
  await run('tar', ['-xzf', archivePath, '-C', temporary]);
  const source = path.join(temporary, `tmux-${tmuxVersion}`);
  await run(path.join(source, 'configure'), [`--prefix=${destination}`, '--enable-sixel'], source);
  await run('make', [`-j${String(Math.max(1, Math.min(4, availableParallelism())))}`], source);
  await run('make', ['install'], source);
  await fs.access(path.join(destination, 'bin', 'tmux'));
  console.log(`Installed tmux ${tmuxVersion} with native SIXEL support at ${destination}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function downloadVerifiedArchive() {
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`tmux download failed with HTTP ${String(response.status)}.`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.byteLength !== archiveByteLength) {
    throw new Error(`tmux archive size mismatch: expected ${String(archiveByteLength)}, received ${String(archive.byteLength)}.`);
  }
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== archiveSha256) {
    throw new Error(`tmux archive checksum mismatch: expected ${archiveSha256}, received ${actual}.`);
  }
  return archive;
}

async function requireEmptyDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length > 0) {
    throw new Error(`tmux destination must be empty: ${directory}`);
  }
}

async function run(command, arguments_, cwd = process.cwd()) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}.`));
    });
  });
}
