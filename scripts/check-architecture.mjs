import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(new URL('../src', import.meta.url).pathname);
const sourceFiles = await collectTypeScript(root);
const knownSourceFiles = new Set(sourceFiles);
const dependencyGraph = new Map();
const failures = [];
const deterministicGlobalLayers = new Set([
  'behavior',
  'components',
  'layout',
  'renderer',
  'ui-model',
  'visual'
]);
const timerRestrictedLayers = new Set([...deterministicGlobalLayers, 'tui']);
const runtimeGlobalNames = new Set(['Bun', 'Deno', 'globalThis', 'process']);

const foundationDependencies = new Map([
  ['diagnostic-identity.ts', new Set()],
  ['diagnostics.ts', new Set(['diagnostic-identity.ts', 'text'])],
  ['foundation', new Set()],
  ['geometry', new Set()],
  ['text', new Set()]
]);

for (const filePath of sourceFiles) {
  const sourceText = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sourceLayer = firstSegment(filePath);
  const dependencies = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = path.resolve(path.dirname(filePath), specifier.text);
    if (knownSourceFiles.has(target)) dependencies.push(target);
    const targetLayer = firstSegment(target);
    const allowedFoundationDependencies = foundationDependencies.get(sourceLayer);
    if (allowedFoundationDependencies !== undefined
      && sourceLayer !== targetLayer
      && targetLayer !== undefined
      && !allowedFoundationDependencies.has(targetLayer)) {
      failures.push(`${relative(filePath)} imports non-foundation ${targetLayer} layer through ${specifier.text}`);
    }
    if (forbiddenDependency(filePath, sourceLayer, targetLayer, target)) {
      failures.push(`${relative(filePath)} imports forbidden ${targetLayer} layer through ${specifier.text}`);
    }
  }
  dependencyGraph.set(filePath, dependencies);
  inspectDeterministicGlobals(sourceFile, sourceLayer, filePath);
  inspectCentralRenderDispatch(sourceFile, filePath);
  inspectElementFactoryCategory(sourceFile, filePath);
  inspectTuiContext(sourceFile, filePath);
}

for (const component of stronglyConnectedComponents(dependencyGraph)) {
  if (component.length <= 1) continue;
  const layers = [...new Set(component.map(firstSegment))];
  const modelOnly = layers.length === 1
    && layers[0] === 'renderer'
    && component.every((filePath) => sourceRelative(filePath).startsWith('renderer/model/'));
  if (!modelOnly) {
    failures.push(`dependency cycle crosses architecture boundaries: ${component.map(relative).sort().join(', ')}`);
  }
}

const rendererIndex = await fs.readFile(path.join(root, 'renderer/index.ts'), 'utf8');
for (const privateModule of [
  'dirty-regions',
  'notifications',
  'pointer-router',
  'render-regions',
  'scrollbar',
  'text-pointer'
]) {
  if (rendererIndex.includes(`/internal/${privateModule}`) || rendererIndex.includes(`./internal/${privateModule}`)) {
    failures.push(`renderer/index.ts exposes package-private ${privateModule} implementation`);
  }
}

if (failures.length > 0) throw new Error(`Architecture contract failed:\n${failures.join('\n')}`);

function inspectDeterministicGlobals(sourceFile, sourceLayer, filePath) {
  if (filePath.endsWith('.test.ts')) return;
  const restrictGlobals = deterministicGlobalLayers.has(sourceLayer);
  const restrictTimers = timerRestrictedLayers.has(sourceLayer);
  if (!restrictGlobals && !restrictTimers) return;
  const visit = (node) => {
    if (restrictGlobals && ts.isIdentifier(node) && runtimeGlobalNames.has(node.text)) {
      failures.push(`${relative(filePath)} reads ${node.text} runtime-global state in deterministic layer ${sourceLayer}`);
    }
    if (restrictTimers && ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && new Set(['setInterval', 'setTimeout']).has(node.expression.text)) {
      failures.push(`${relative(filePath)} creates a raw timer in scheduler-controlled layer ${sourceLayer}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function inspectCentralRenderDispatch(sourceFile, filePath) {
  if (!new Set([
    'renderer/internal/layout.ts',
    'renderer/internal/render-accessibility.ts',
    'renderer/internal/render.ts'
  ]).has(sourceRelative(filePath))) return;
  const visit = (node) => {
    if (ts.isSwitchStatement(node) && containsKindProperty(node.expression)) {
      failures.push(`${relative(filePath)} dispatches render-node kinds outside the renderer registry`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function containsKindProperty(node) {
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'kind') return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsKindProperty(child)) found = true;
  });
  return found;
}

function inspectElementFactoryCategory(sourceFile, filePath) {
  const sourcePath = sourceRelative(filePath);
  const constructors = new Set([
    'componentElementFromRenderNode',
    'layoutElementFromRenderNode',
    'extensionElementFromRenderNode'
  ]);
  let expected;
  if (sourcePath.startsWith('components/factories/')) {
    expected = sourcePath.endsWith('/index.ts') ? undefined : 'componentElementFromRenderNode';
  } else if (sourcePath.startsWith('layout/factories/')) {
    expected = sourcePath.endsWith('/index.ts') || sourcePath.endsWith('/internals.ts')
      ? undefined
      : 'layoutElementFromRenderNode';
  } else if (new Set([
    'renderer/custom-composite.ts',
    'renderer/custom-element.ts'
  ]).has(sourcePath)) {
    expected = 'extensionElementFromRenderNode';
  }

  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && constructors.has(node.expression.text)) {
      calls.push(node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (sourcePath === 'renderer/model/element.ts') return;
  if (expected === undefined) {
    for (const constructor of calls) {
      failures.push(`${relative(filePath)} constructs an element with ${constructor} outside its factory category`);
    }
    return;
  }
  if (!calls.includes(expected)) {
    failures.push(`${relative(filePath)} must construct elements with ${expected}`);
  }
  for (const constructor of calls) {
    if (constructor !== expected) {
      failures.push(`${relative(filePath)} uses ${constructor}; expected ${expected}`);
    }
  }
}

function inspectTuiContext(sourceFile, filePath) {
  if (relative(filePath) !== 'src/tui/types.ts') return;
  const declaration = sourceFile.statements.find((statement) =>
    ts.isInterfaceDeclaration(statement) && statement.name.text === 'TuiContext'
  );
  if (declaration === undefined || !ts.isInterfaceDeclaration(declaration)) {
    failures.push('src/tui/types.ts must declare TuiContext.');
    return;
  }
  for (const member of declaration.members) {
    if (ts.isPropertySignature(member) && member.name !== undefined
      && ts.isIdentifier(member.name) && member.name.text === 'host') {
      failures.push('TuiContext must not expose terminal host authority.');
    }
  }
}

function forbiddenDependency(sourceFile, sourceLayer, targetLayer, targetFile) {
  const neutral = new Set(['behavior', 'element', 'geometry', 'interaction', 'ui-model', 'visual']);
  const upper = new Set(['authoring', 'components', 'layout', 'renderer', 'testing', 'transcript', 'tui']);
  if (sourceLayer === 'visual' && new Set(['behavior', 'interaction', 'ui-model']).has(targetLayer)) return true;
  if (sourceLayer === 'interaction' && new Set(['behavior', 'ui-model']).has(targetLayer)) return true;
  if (sourceLayer === 'ui-model' && targetLayer === 'behavior') return true;
  if (sourceRelative(sourceFile).startsWith('renderer/model/')
    && sourceRelative(targetFile).startsWith('renderer/internal/')) return true;
  if (neutral.has(sourceLayer) && upper.has(targetLayer)) return true;
  if (sourceLayer === 'authoring' && new Set(['components', 'layout', 'tui']).has(targetLayer)) return true;
  if (sourceLayer === 'authoring' && targetLayer === 'renderer'
    && sourceRelative(targetFile).startsWith('renderer/internal/')) return true;
  if (sourceLayer === 'components' && new Set(['layout', 'tui']).has(targetLayer)) return true;
  if (sourceLayer === 'components' && targetLayer === 'renderer'
    && sourceRelative(targetFile).startsWith('renderer/internal/')) return true;
  if (sourceLayer === 'layout' && new Set(['components', 'tui']).has(targetLayer)) return true;
  if (sourceLayer === 'layout' && targetLayer === 'renderer'
    && sourceRelative(targetFile).startsWith('renderer/internal/')) return true;
  if (sourceLayer === 'renderer' && new Set(['authoring', 'components', 'layout', 'tui']).has(targetLayer)) return true;
  if (sourceLayer === 'transcript' && targetLayer === 'tui') return true;
  if (sourceLayer === 'visual' && targetLayer === 'theme') return true;
  if (sourceLayer === 'theme' && new Set(['renderer', 'tui']).has(targetLayer)) return true;
  return sourceLayer === 'protocol' && targetLayer === 'host';
}

function firstSegment(filePath) {
  const relativePath = path.relative(root, filePath);
  return relativePath.startsWith('..') ? undefined : relativePath.split(path.sep)[0];
}

function sourceRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function relative(filePath) {
  return path.relative(path.dirname(root), filePath);
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

async function collectTypeScript(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTypeScript(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}
