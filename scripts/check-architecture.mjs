import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(new URL('../src', import.meta.url).pathname);
const sourceFiles = await collectTypeScript(root);
const failures = [];

const foundationDependencies = new Map([
  ['diagnostic-identity.ts', new Set()],
  ['diagnostics.ts', new Set(['diagnostic-identity.ts', 'text'])],
  ['foundation', new Set()],
  ['geometry', new Set()],
  ['text', new Set()]
]);

const forbiddenDependencies = new Map([
  ['protocol', new Set(['behavior', 'components', 'host', 'input', 'interaction', 'layout', 'renderer', 'testing', 'tui', 'ui-model', 'visual'])],
  ['host', new Set(['behavior', 'components', 'layout', 'renderer', 'testing', 'tui', 'ui-model'])],
  ['input', new Set(['behavior', 'components', 'layout', 'renderer', 'testing', 'tui', 'ui-model'])],
  ['interaction', new Set(['behavior', 'components', 'host', 'layout', 'renderer', 'testing', 'tui', 'ui-model'])],
  ['ui-model', new Set(['behavior', 'components', 'host', 'renderer', 'testing', 'tui'])],
  ['visual', new Set(['components', 'host', 'renderer', 'testing', 'tui'])],
  ['components', new Set(['host', 'testing', 'tui'])],
  ['layout', new Set(['host', 'testing', 'tui'])],
  ['renderer', new Set(['components', 'host', 'layout', 'testing', 'tui'])]
]);

for (const filePath of sourceFiles) {
  const sourceText = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sourceLayer = firstSegment(filePath);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = path.resolve(path.dirname(filePath), specifier.text);
    const targetLayer = firstSegment(target);
    const allowedFoundationDependencies = foundationDependencies.get(sourceLayer);
    if (allowedFoundationDependencies !== undefined
      && sourceLayer !== targetLayer
      && targetLayer !== undefined
      && !allowedFoundationDependencies.has(targetLayer)) {
      failures.push(`${relative(filePath)} imports non-foundation ${targetLayer} layer through ${specifier.text}`);
    }
    if (forbiddenDependencies.get(sourceLayer)?.has(targetLayer) === true) {
      failures.push(`${relative(filePath)} imports forbidden ${targetLayer} layer through ${specifier.text}`);
    }
  }
  inspectDeterministicGlobals(sourceFile, sourceLayer, filePath);
  inspectTuiContext(sourceFile, filePath);
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
  if (!new Set(['behavior', 'components', 'layout', 'renderer', 'ui-model', 'visual']).has(sourceLayer)) return;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 'process') {
      failures.push(`${relative(filePath)} reads process-global state in deterministic layer ${sourceLayer}`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && new Set(['setInterval', 'setTimeout']).has(node.expression.text)) {
      failures.push(`${relative(filePath)} creates a raw timer in deterministic layer ${sourceLayer}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
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
