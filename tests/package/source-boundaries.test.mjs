import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/gu;

test('source dependencies follow the architecture boundary direction', async () => {
  const graph = await sourceGraph();
  const violations = [];
  for (const [file, dependencies] of graph) {
    const owner = sourceOwner(file);
    for (const dependency of dependencies) {
      const target = sourceOwner(dependency);
      if (forbiddenDependency(file, owner, target, dependency)) {
        violations.push(`${relative(file)} -> ${relative(dependency)}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('dependency cycles do not cross source ownership boundaries', async () => {
  const graph = await sourceGraph();
  const invalid = stronglyConnectedComponents(graph)
    .filter((component) => component.length > 1)
    .map((component) => ({
      files: component.map(relative).sort(),
      owners: [...new Set(component.map(sourceOwner))].sort()
    }))
    .filter((component) => component.owners.length > 1
      || component.owners[0] !== 'renderer'
      || component.files.some((file) => !file.startsWith('renderer/model/')));
  assert.deepEqual(invalid, []);
});

async function sourceGraph() {
  const files = await sourceFiles(sourceRoot);
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const dependencies = [];
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = path.resolve(path.dirname(file), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`);
      if (known.has(resolved)) dependencies.push(resolved);
    }
    graph.set(file, dependencies);
  }
  return graph;
}

function forbiddenDependency(sourceFile, owner, target, targetFile) {
  const neutral = new Set(['behavior', 'element', 'foundation', 'geometry', 'interaction', 'ui-model', 'visual']);
  const upper = new Set(['authoring', 'components', 'layout', 'renderer', 'testing', 'transcript', 'tui']);
  if (owner === 'foundation' && target !== 'foundation') return true;
  if (owner === 'visual' && new Set(['behavior', 'interaction', 'ui-model']).has(target)) return true;
  if (owner === 'interaction' && new Set(['behavior', 'ui-model']).has(target)) return true;
  if (owner === 'ui-model' && target === 'behavior') return true;
  if (relative(sourceFile).startsWith('renderer/model/')
    && relative(targetFile).startsWith('renderer/internal/')) return true;
  if (neutral.has(owner) && upper.has(target)) return true;
  if (owner === 'authoring' && (target === 'components' || target === 'layout' || target === 'tui')) return true;
  if (owner === 'authoring' && target === 'renderer' && targetFile.includes(`${path.sep}internal${path.sep}`)) return true;
  if (owner === 'components' && (target === 'layout' || target === 'tui')) return true;
  if (owner === 'components' && target === 'renderer' && targetFile.includes(`${path.sep}internal${path.sep}`)) return true;
  if (owner === 'layout' && (target === 'components' || target === 'tui')) return true;
  if (owner === 'layout' && target === 'renderer' && targetFile.includes(`${path.sep}internal${path.sep}`)) return true;
  if (owner === 'renderer' && (target === 'authoring' || target === 'components' || target === 'layout' || target === 'tui')) return true;
  if (owner === 'transcript' && target === 'tui') return true;
  if (owner === 'visual' && target === 'theme') return true;
  if (owner === 'theme' && (target === 'renderer' || target === 'tui')) return true;
  return owner === 'protocol' && target === 'host';
}

function sourceOwner(file) {
  return relative(file).split('/')[0];
}

function relative(file) {
  return path.relative(sourceRoot, file).split(path.sep).join('/');
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const current = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(current) : current.endsWith('.ts') ? [current] : [];
  }));
  return files.flat();
}

function stronglyConnectedComponents(graph) {
  let nextIndex = 0;
  const stack = [];
  const active = new Set();
  const indexes = new Map();
  const lowLinks = new Map();
  const components = [];

  const visit = (node) => {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    active.add(node);
    for (const dependency of graph.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
      } else if (active.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      active.delete(current);
      component.push(current);
    } while (current !== node);
    components.push(component);
  };

  for (const node of graph.keys()) if (!indexes.has(node)) visit(node);
  return components;
}
