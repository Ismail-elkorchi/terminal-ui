import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

export async function requireEmptyDirectory(directory, name) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length > 0) throw new Error(`${name} destination must be empty: ${directory}`);
}

export async function downloadVerifiedArchive({ name, url, byteLength, sha256 }) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${name} download failed with HTTP ${String(response.status)}.`);
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.byteLength !== byteLength) {
    throw new Error(`${name} archive size mismatch: expected ${String(byteLength)}, received ${String(archive.byteLength)}.`);
  }
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== sha256) throw new Error(`${name} archive checksum mismatch: expected ${sha256}, received ${actual}.`);
  return archive;
}
