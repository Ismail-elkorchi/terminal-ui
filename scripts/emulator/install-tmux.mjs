import { run } from './support/process.mjs';
import { downloadVerifiedArchive, requireEmptyDirectory } from './support/install.mjs';
import { availableParallelism } from 'node:os';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const tmuxVersion = '3.7c';
const archiveSha256 = '7c60cae9a0e25288e2e24750aafc9e8800fc7fd4555e447e1b29ee4201cfb3bf';
const archiveByteLength = 789_431;
const archiveUrl = `https://github.com/tmux/tmux/releases/download/${tmuxVersion}/tmux-${tmuxVersion}.tar.gz`;

if (process.platform !== 'linux') {
  throw new Error('The pinned tmux conformance build supports only Linux runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/emulator/install-tmux.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination, 'tmux');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-tmux-build-'));
try {
  const archive = await downloadVerifiedArchive({ name: 'tmux', url: archiveUrl, byteLength: archiveByteLength, sha256: archiveSha256 });
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
