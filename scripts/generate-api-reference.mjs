import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(projectRoot, 'docs', 'api', 'reference.md');
const check = process.argv.includes('--check');
const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const entrypoints = Object.entries(manifest.exports)
  .filter(([, value]) => typeof value?.types === 'string' && !value.types.includes('*'))
  .map(([name, value]) => ({
    name,
    file: path.resolve(projectRoot, value.types),
  }));

for (const entrypoint of entrypoints) {
  try {
    await fs.access(entrypoint.file);
  } catch {
    throw new Error(`Build declarations before generating the API reference: ${entrypoint.file}`);
  }
}

const program = ts.createProgram({
  rootNames: entrypoints.map((entrypoint) => entrypoint.file),
  options: {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    skipLibCheck: true,
  },
});
const checker = program.getTypeChecker();
const records = new Map();

for (const entrypoint of entrypoints) {
  const source = program.getSourceFile(entrypoint.file);
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || moduleSymbol === undefined) {
    throw new Error(`Cannot inspect public entrypoint ${entrypoint.name}.`);
  }
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = resolveAlias(exported);
    const existing = records.get(target);
    if (existing === undefined) {
      records.set(target, { target, names: new Set([exported.name]), entrypoints: new Set([entrypoint.name]) });
    } else {
      existing.names.add(exported.name);
      existing.entrypoints.add(entrypoint.name);
    }
  }
}

const publicSymbols = [...records.values()].map((record) => {
  const declaration = record.target.valueDeclaration ?? record.target.getDeclarations()?.[0];
  if (declaration === undefined) throw new Error(`Public symbol ${record.target.name} has no declaration.`);
  const names = [...record.names].sort(codeUnitCompare);
  const availability = [...record.entrypoints].sort(codeUnitCompare);
  return {
    name: names[0],
    aliases: names.slice(1),
    owner: owningEntrypoint(availability),
    availability,
    kind: declarationKind(declaration),
    signature: declarationSignature(record.target, declaration),
    stability: symbolStability(record.target),
    source: sourcePath(declaration),
  };
}).sort((left, right) =>
  codeUnitCompare(left.owner, right.owner) || codeUnitCompare(left.name, right.name)
);

const generated = renderReference(publicSymbols);
if (check) {
  const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
  if (current !== generated) {
    throw new Error('docs/api/reference.md is stale; run npm run docs:api.');
  }
} else {
  await fs.writeFile(outputPath, generated, 'utf8');
}

function resolveAlias(symbol) {
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
}

function owningEntrypoint(availability) {
  return [...availability].sort((left, right) =>
    entrypointSpecificity(right) - entrypointSpecificity(left) || codeUnitCompare(left, right)
  )[0];
}

function entrypointSpecificity(entrypoint) {
  if (entrypoint === '.') return 0;
  if (entrypoint === './components') return 1;
  return entrypoint.split('/').length;
}

function declarationKind(declaration) {
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodSignature(declaration)) return 'function';
  if (ts.isClassDeclaration(declaration)) return 'class';
  if (ts.isInterfaceDeclaration(declaration)) return 'interface';
  if (ts.isTypeAliasDeclaration(declaration)) return 'type';
  if (ts.isEnumDeclaration(declaration)) return 'enum';
  if (ts.isVariableDeclaration(declaration)) return 'value';
  return 'declaration';
}

function declarationSignature(symbol, declaration) {
  if ((symbol.flags & ts.SymbolFlags.Value) !== 0) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const calls = type.getCallSignatures();
    if (calls.length > 0) {
      return calls.map((signature) => checker.signatureToString(
        signature,
        declaration,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
      )).join(' | ');
    }
    return checker.typeToString(
      type,
      declaration,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    return `type ${symbol.name} = ${checker.typeToString(
      checker.getDeclaredTypeOfSymbol(symbol),
      declaration,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    )}`;
  }
  return `${declarationKind(declaration)} ${symbol.name}`;
}

function symbolStability(symbol) {
  const declarations = symbol.getDeclarations() ?? [];
  const graphicsPreview = declarations.some((declaration) => {
    const source = sourcePath(declaration);
    return source.startsWith('src/graphics/')
      || (source === 'src/components/factories/drawing.ts' && symbol.name === 'image');
  });
  if (graphicsPreview) return 'experimental';
  const tags = declarations.flatMap((declaration) =>
    ts.getJSDocTags(declaration).map((tag) => tag.tagName.text)
  );
  if (tags.includes('experimental')) return 'experimental';
  if (tags.includes('beta')) return 'beta';
  return 'stable';
}

function sourcePath(declaration) {
  const declarationPath = path.relative(projectRoot, declaration.getSourceFile().fileName)
    .split(path.sep).join('/');
  return declarationPath.startsWith('dist/')
    ? `src/${declarationPath.slice('dist/'.length).replace(/\.d\.ts$/u, '.ts')}`
    : declarationPath;
}

function renderReference(symbols) {
  const lines = [
    '# Generated API Reference',
    '',
    '<!-- Generated by scripts/generate-api-reference.mjs. Do not edit by hand. -->',
    '',
    'Each public declaration is listed once under its most focused owning entrypoint.',
    'The availability column records every entrypoint that re-exports the same declaration.',
    'Stability meanings are defined in [API stability](../guides/api-stability.md).',
    '',
  ];
  let owner;
  for (const symbol of symbols) {
    if (symbol.owner !== owner) {
      owner = symbol.owner;
      lines.push(`## \`${packageName(owner)}\``, '', '| Symbol | Kind | Stability | Signature | Availability | Source |', '| --- | --- | --- | --- | --- | --- |');
    }
    lines.push(`| \`${escapeTable(symbol.name)}\` | ${symbol.kind} | ${symbol.stability} | <code>${escapeCode(symbol.signature)}</code> | ${symbol.availability.map((entrypoint) => `\`${packageName(entrypoint)}\``).join(', ')} | [${symbol.source}](../../${symbol.source}) |`);
  }
  return `${lines.join('\n')}\n`;
}

function packageName(entrypoint) {
  return `${manifest.name}${entrypoint === '.' ? '' : entrypoint.slice(1)}`;
}

function escapeTable(value) {
  return value.replaceAll('|', '\\|');
}

function escapeCode(value) {
  return escapeTable(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('`', '&#96;')
    .replaceAll(/\s+/gu, ' ');
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
