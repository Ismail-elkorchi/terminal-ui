import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import { discoverTestFiles, testLaneDirectories } from './test-discovery.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const testOutput = resolve(root, '.artifacts', 'test-build');
await rm(testOutput, { recursive: true, force: true });
const files = await discoverTestFiles(testLaneDirectories(root, 'unit'));
const testFiles = await Promise.all(files.map(async (file) => {
  const source = relative(resolve(root, 'src'), file);
  if (source.startsWith('..')) return relative(root, file);
  const output = resolve(testOutput, source.replace(/\.ts$/u, '.mjs'));
  const compiled = ts.transpileModule(await readFile(file, 'utf8'), {
    fileName: file,
    transformers: { before: [resolveProductionImports(file)] },
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2024,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, compiled);
  return relative(root, output);
}));
const arguments_ = [
  '--experimental-test-coverage',
  '--test-coverage-include=dist/**/*.js',
  '--test-coverage-exclude=dist/**/*.test.js',
  '--test-coverage-lines=90',
  '--test-coverage-branches=80',
  '--test-coverage-functions=90',
  '--test',
  ...testFiles,
];

const code = await new Promise((resolveCode, reject) => {
  const child = spawn(process.execPath, arguments_, { cwd: root, stdio: 'inherit' });
  child.once('error', reject);
  child.once('close', (value) => resolveCode(value ?? 1));
});
process.exitCode = code;

function resolveProductionImports(file) {
  return (context) => {
    const visit = (node) => {
      if (ts.isStringLiteral(node) && node.text.startsWith('.') && (
        ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)
        || ts.isCallExpression(node.parent) && node.parent.expression.kind === ts.SyntaxKind.ImportKeyword
      )) {
        const target = resolve(dirname(file), node.text);
        const sourcePath = relative(resolve(root, 'src'), target);
        if (sourcePath.startsWith('..')) throw new Error(`Source test import escapes src: ${target}`);
        return context.factory.createStringLiteral(pathToFileURL(
          resolve(root, 'dist', sourcePath.replace(/\.ts$/u, '.js'))
        ).href);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (sourceFile) => ts.visitNode(sourceFile, visit);
  };
}
