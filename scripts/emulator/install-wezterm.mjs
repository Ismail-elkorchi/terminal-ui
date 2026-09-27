import { run } from './support/process.mjs';
import { downloadVerifiedArchive, requireEmptyDirectory } from './support/install.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const weztermVersion = '20240203-110809-5046fc22';
const archiveSha256 = '34010a07076d2272c4d4f94b5e0dae608a679599e8d729446323f88f956c60f0';
const archiveByteLength = 49_505_472;
const archiveName = `WezTerm-${weztermVersion}-Ubuntu20.04.AppImage`;
const archiveUrl = `https://github.com/wezterm/wezterm/releases/download/${weztermVersion}/${archiveName}`;

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('The pinned WezTerm conformance binary supports only Linux x64 runners.');
}

const destinationArgument = process.argv[2];
if (destinationArgument === undefined || destinationArgument.trim() === '') {
  throw new Error('Usage: node scripts/emulator/install-wezterm.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination, 'WezTerm');
// Stage beside the destination so final installation stays on one filesystem.
const temporary = await fs.mkdtemp(path.join(path.dirname(destination), '.terminal-ui-wezterm-'));
try {
  const archive = await downloadVerifiedArchive({ name: 'WezTerm', url: archiveUrl, byteLength: archiveByteLength, sha256: archiveSha256 });
  const archivePath = path.join(temporary, archiveName);
  await fs.writeFile(archivePath, archive, { mode: 0o700 });
  await run(archivePath, ['--appimage-extract'], temporary);
  await fs.rename(path.join(temporary, 'squashfs-root'), destination);
  await fs.access(path.join(destination, 'usr', 'bin', 'wezterm'));
  console.log(`Installed WezTerm ${weztermVersion} at ${destination}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
