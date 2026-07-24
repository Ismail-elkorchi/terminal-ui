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
    const sourceLayer = layerForSource(file);
    for (const dependency of dependencies) {
      const targetLayer = layerForSource(dependency);
      if (forbiddenDependency(file, sourceLayer, targetLayer, dependency)) {
        violations.push(`${relative(file)} -> ${relative(dependency)}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('dependency cycles do not cross source-layer boundaries', async () => {
  const graph = await sourceGraph();
  const invalid = stronglyConnectedComponents(graph)
    .filter((component) => component.length > 1)
    .map((component) => ({
      files: component.map(relative).sort(),
      layers: [...new Set(component.map(layerForSource))].sort()
    }))
    .filter((component) => component.layers.length > 1
      || component.layers[0] !== 'renderer'
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

function forbiddenDependency(sourceFile, sourceLayer, targetLayer, targetFile) {
  const neutral = new Set(['behavior', 'element', 'foundation', 'geometry', 'interaction', 'ui-model', 'visual']);
  const upper = new Set(['authoring', 'components', 'layout', 'renderer', 'testing', 'transcript', 'tui']);
  if (sourceLayer === 'foundation' && targetLayer !== 'foundation') return true;
  if (sourceLayer === 'visual' && new Set(['behavior', 'interaction', 'ui-model']).has(targetLayer)) return true;
  if (sourceLayer === 'interaction' && new Set(['behavior', 'ui-model']).has(targetLayer)) return true;
  if (sourceLayer === 'ui-model' && targetLayer === 'behavior') return true;
  if (relative(sourceFile).startsWith('renderer/model/')
    && relative(targetFile).startsWith('renderer/internal/')) return true;
  if (neutral.has(sourceLayer) && upper.has(targetLayer)) return true;
  if (sourceLayer === 'authoring' && (targetLayer === 'components' || targetLayer === 'layout' || targetLayer === 'tui')) return true;
  if (sourceLayer === 'authoring' && targetLayer === 'renderer' && targetFile.includes(`${path.sep}internal${path.sep}`)) return true;
  if (sourceLayer === 'components' && (targetLayer === 'layout' || targetLayer === 'tui')) return true;
  if (sourceLayer === 'components' && targetLayer === 'renderer' && targetFile.includes(`${path.sep}internal${path.sep}`)) return true;
  if (sourceLayer === 'layout' && (targetLayer === 'components' || targetLayer === 'tui')) return true;
  if (sourceLayer === 'layout' && targetLayer === 'renderer' && targetFile.includes(`${path.sep}internal${path.sep}`)) return true;
  if (sourceLayer === 'renderer' && (targetLayer === 'authoring' || targetLayer === 'components' || targetLayer === 'layout' || targetLayer === 'tui')) return true;
  if (sourceLayer === 'transcript' && targetLayer === 'tui') return true;
  if (sourceLayer === 'visual' && targetLayer === 'theme') return true;
  if (sourceLayer === 'theme' && (targetLayer === 'renderer' || targetLayer === 'tui')) return true;
  return sourceLayer === 'protocol' && targetLayer === 'host';
}

function layerForSource(file) {
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
