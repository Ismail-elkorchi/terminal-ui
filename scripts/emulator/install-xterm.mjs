import { run } from './support/process.mjs';
import { downloadVerifiedArchive, requireEmptyDirectory } from './support/install.mjs';
import { availableParallelism } from 'node:os';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const xtermVersion = '411';
const archiveSha256 = '969be283670deadd66934865c4de6c5ab045e3a3facc2b228decf91a20d8c36c';
const archiveByteLength = 1_633_400;
const archiveUrl = `https://invisible-island.net/archives/xterm/xterm-${xtermVersion}.tgz`;

if (process.platform !== 'linux') {
  throw new Error('The pinned xterm conformance build supports only Linux runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/emulator/install-xterm.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination, 'xterm');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-xterm-build-'));
try {
  const archive = await downloadVerifiedArchive({ name: 'xterm', url: archiveUrl, byteLength: archiveByteLength, sha256: archiveSha256 });
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
