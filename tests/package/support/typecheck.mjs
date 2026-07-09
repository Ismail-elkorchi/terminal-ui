import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const jsrPackageSpecifier = 'jsr:@ismail-elkorchi/terminal-ui';
const npmPackageSpecifier = '@ismail-elkorchi/terminal-ui';

export function typecheckSource(source, options = {}) {
  return typecheckSources([{ source, ...options }]);
}

export function typecheckSources(sources) {
  const virtualSources = new Map(sources.map((input, index) => {
    const language = input.language ?? 'ts';
    const extension = language === 'js' || language === 'javascript' ? 'mjs' : 'mts';
    const name = input.name ?? `public-typecheck-${String(index + 1)}`;
    const fileName = fileURLToPath(new URL(`../__${sanitizeName(name)}__.${extension}`, import.meta.url));
    return [fileName, input.source.replaceAll(jsrPackageSpecifier, npmPackageSpecifier)];
  }));
  const compilerOptions = {
    target: ts.ScriptTarget.ES2024,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: false,
    types: ['node'],
    allowJs: true,
    checkJs: true,
    moduleDetection: ts.ModuleDetectionKind.Force
  };
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    virtualSources.has(path)
      ? ts.createSourceFile(path, virtualSources.get(path) ?? '', languageVersion, true)
      : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
  host.fileExists = (path) => virtualSources.has(path) || fileExists(path);
  host.readFile = (path) => virtualSources.has(path)
    ? virtualSources.get(path) ?? ''
    : readFile(path);

  const program = ts.createProgram([...virtualSources.keys()], compilerOptions, host);
  return ts.getPreEmitDiagnostics(program);
}

export function formatTypeDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${String(position.line + 1)}:${String(position.character + 1)} ${message}`;
}

function sanitizeName(value) {
  return value.replaceAll(/[^A-Za-z0-9_-]/gu, '-');
}
