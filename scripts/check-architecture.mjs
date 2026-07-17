import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(new URL('../src', import.meta.url).pathname);
const sourceFiles = await collectTypeScript(root);
const failures = [];

const forbiddenDependencies = new Map([
  ['ui-model', new Set(['behavior', 'components', 'host', 'renderer', 'testing', 'tui'])],
  ['visual', new Set(['components', 'host', 'renderer', 'testing', 'tui'])],
  ['components', new Set(['host', 'testing', 'tui'])],
  ['layout', new Set(['host', 'testing', 'tui'])],
  ['renderer', new Set(['components', 'host', 'layout', 'testing', 'tui'])]
]);

for (const filePath of sourceFiles) {
  const sourceText = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const owner = firstSegment(filePath);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = path.resolve(path.dirname(filePath), specifier.text);
    const targetOwner = firstSegment(target);
    if (forbiddenDependencies.get(owner)?.has(targetOwner) === true) {
      failures.push(`${relative(filePath)} imports forbidden ${targetOwner} layer through ${specifier.text}`);
    }
  }
  inspectDeterministicGlobals(sourceFile, owner, filePath);
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

function inspectDeterministicGlobals(sourceFile, owner, filePath) {
  if (!new Set(['behavior', 'components', 'layout', 'renderer', 'ui-model', 'visual']).has(owner)) return;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 'process') {
      failures.push(`${relative(filePath)} reads process-global state in deterministic layer ${owner}`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && new Set(['setInterval', 'setTimeout']).has(node.expression.text)) {
      failures.push(`${relative(filePath)} creates a raw timer in deterministic layer ${owner}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function firstSegment(filePath) {
  const relativePath = path.relative(root, filePath);
  return relativePath.startsWith('..') ? undefined : relativePath.split(path.sep)[0];
}

function relative(filePath) {
  return path.relative(path.dirname(root), filePath);
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
