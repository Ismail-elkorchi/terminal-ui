import { run } from './support/process.mjs';
import { downloadVerifiedArchive, requireEmptyDirectory } from './support/install.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const kittyVersion = '0.48.2';
const archiveSha256 = '967a1958e7fc67b495d279c0963bcd1a0482097151817ce6506fabc822689af7';
const archiveByteLength = 32_024_932;
const archiveUrl = `https://github.com/kovidgoyal/kitty/releases/download/v${kittyVersion}/kitty-${kittyVersion}-x86_64.txz`;

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('The pinned Kitty conformance binary supports only Linux x64 runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/emulator/install-kitty.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination, 'Kitty');
const archive = await downloadVerifiedArchive({ name: 'Kitty', url: archiveUrl, byteLength: archiveByteLength, sha256: archiveSha256 });

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
