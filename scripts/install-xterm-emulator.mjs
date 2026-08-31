import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const xtermVersion = '411';
const archiveSha256 = '969be283670deadd66934865c4de6c5ab045e3a3facc2b228decf91a20d8c36c';
const archiveByteLength = 1_633_400;
const archiveUrl = `https://invisible-island.net/archives/xterm/xterm-${xtermVersion}.tgz`;

if (process.platform !== 'linux') {
  throw new Error('The pinned xterm conformance build supports only Linux runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/install-xterm-emulator.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-xterm-build-'));
try {
  const archive = await downloadVerifiedArchive();
  const archivePath = path.join(temporary, `xterm-${xtermVersion}.tgz`);
  await fs.writeFile(archivePath, archive, { mode: 0o600 });
  await run('tar', ['-xzf', archivePath, '-C', temporary]);
  const source = path.join(temporary, `xterm-${xtermVersion}`);
  await run(path.join(source, 'configure'), [
    `--prefix=${destination}`,
    '--enable-sixel-graphics',
    '--disable-setuid',
    '--disable-setgid',
  ], source);
  await run('make', [`-j${String(Math.max(1, Math.min(4, availableParallelism())))}`], source);
  await run('make', ['install'], source);
  await fs.access(path.join(destination, 'bin', 'xterm'));
  console.log(`Installed xterm ${xtermVersion} with SIXEL support at ${destination}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function downloadVerifiedArchive() {
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`xterm download failed with HTTP ${String(response.status)}.`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.byteLength !== archiveByteLength) {
    throw new Error(`xterm archive size mismatch: expected ${String(archiveByteLength)}, received ${String(archive.byteLength)}.`);
  }
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== archiveSha256) {
    throw new Error(`xterm archive checksum mismatch: expected ${archiveSha256}, received ${actual}.`);
  }
  return archive;
}

async function requireEmptyDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length > 0) {
    throw new Error(`xterm destination must be empty: ${directory}`);
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
