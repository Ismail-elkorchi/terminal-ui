import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { fileDialog, text } from '@ismail-elkorchi/terminal-ui/widgets';

const root = fileURLToPath(new URL('../..', import.meta.url));
const baseDirectory = path.join(root, 'examples');
const entries = await readDirectoryEntries(baseDirectory, {
  root: baseDirectory,
  maxDepth: 2,
  maxEntriesPerDirectory: 12
});

const selected = firstFileId(entries) ?? entries[0]?.id;
const frame = renderWidgetFrame(fileDialog({
  id: 'example-file-dialog',
  title: 'Open example',
  entries,
  selected,
  filterValue: 'showcase',
  filterInputMap: { text: (value) => ({ kind: 'filter', value }) },
  preview: text(selected ?? 'No file selected'),
  confirmMessage: { kind: 'open', id: selected },
  cancelMessage: { kind: 'cancel' },
  width: 80,
  height: 18
}), { columns: 90, rows: 22 });

console.log(renderFramePlain(frame));
console.log(JSON.stringify({
  source: 'examples/files/file-dialog.mjs',
  adapter: 'node-fs-example',
  entryCount: countEntries(entries),
  selected
}));

async function readDirectoryEntries(directory, options, depth = 0) {
  const dirents = await readdir(directory, { withFileTypes: true });
  const sorted = dirents
    .filter((dirent) => !dirent.name.startsWith('.'))
    .sort((a, b) => kindRank(a) - kindRank(b) || a.name.localeCompare(b.name))
    .slice(0, options.maxEntriesPerDirectory);

  return Promise.all(sorted.map(async (dirent) => {
    const absolutePath = path.join(directory, dirent.name);
    const relativePath = path.relative(options.root, absolutePath) || dirent.name;
    const entryKind = kindForDirent(dirent);
    const fileStat = await stat(absolutePath);
    return {
      id: relativePath,
      name: dirent.name,
      path: relativePath,
      kind: entryKind,
      expanded: depth === 0 && entryKind === 'directory',
      metadata: {
        bytes: String(fileStat.size)
      },
      ...(entryKind === 'directory' && depth < options.maxDepth
        ? { children: await readDirectoryEntries(absolutePath, options, depth + 1) }
        : {})
    };
  }));
}

function kindForDirent(dirent) {
  if (dirent.isDirectory()) return 'directory';
  if (dirent.isFile()) return 'file';
  if (dirent.isSymbolicLink()) return 'symlink';
  return 'other';
}

function kindRank(dirent) {
  return dirent.isDirectory() ? 0 : 1;
}

function firstFileId(entriesToSearch) {
  for (const entry of entriesToSearch) {
    if (entry.kind === 'file') return entry.id;
    const child = entry.children === undefined ? undefined : firstFileId(entry.children);
    if (child !== undefined) return child;
  }
  return undefined;
}

function countEntries(entriesToCount) {
  return entriesToCount.reduce((count, entry) => count + 1 + countEntries(entry.children ?? []), 0);
}
