import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
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
  throw new Error('Usage: node scripts/install-wezterm-emulator.mjs <empty-destination>');
}

const destination = path.resolve(destinationArgument);
await requireEmptyDirectory(destination);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-wezterm-'));
try {
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`WezTerm download failed with HTTP ${String(response.status)}.`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.byteLength !== archiveByteLength) {
    throw new Error(`WezTerm archive size mismatch: expected ${String(archiveByteLength)}, received ${String(archive.byteLength)}.`);
  }
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== archiveSha256) {
    throw new Error(`WezTerm archive checksum mismatch: expected ${archiveSha256}, received ${actual}.`);
  }
  const archivePath = path.join(temporary, archiveName);
  await fs.writeFile(archivePath, archive, { mode: 0o700 });
  await run(archivePath, ['--appimage-extract'], temporary);
  await fs.rename(path.join(temporary, 'squashfs-root'), destination);
  await fs.access(path.join(destination, 'usr', 'bin', 'wezterm'));
  console.log(`Installed WezTerm ${weztermVersion} at ${destination}`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function requireEmptyDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length > 0) {
    throw new Error(`WezTerm destination must be empty: ${directory}`);
  }
}

async function run(executable, arguments_, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}.`));
    });
  });
}
