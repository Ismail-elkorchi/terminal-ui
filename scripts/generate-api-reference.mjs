import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(projectRoot, 'docs', 'api', 'reference.md');
const overviewPath = path.join(projectRoot, 'docs', 'api', 'index.md');
const check = process.argv.includes('--check');
const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const entrypoints = Object.entries(manifest.exports)
  .filter(([, value]) => typeof value?.types === 'string' && !value.types.includes('*'))
  .map(([name, value]) => ({
    name,
    file: path.resolve(projectRoot, value.types),
    runtimeFile: path.resolve(projectRoot, value.default),
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
const runtimeNamesByEntrypoint = new Map(entrypoints.map((entrypoint) => [
  entrypoint.name,
  runtimeExportNames(program.getSourceFile(entrypoint.file)),
]));
const componentStyling = componentStylingContracts();

for (const entrypoint of entrypoints) {
  const source = program.getSourceFile(entrypoint.file);
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (source === undefined || moduleSymbol === undefined) {
    throw new Error(`Cannot inspect public entrypoint ${entrypoint.name}.`);
  }
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = resolveAlias(exported);
    const runtime = runtimeNamesByEntrypoint.get(entrypoint.name)?.has(exported.name) === true
      && (target.flags & ts.SymbolFlags.Value) !== 0;
    const existing = records.get(target);
    if (existing === undefined) {
      records.set(target, {
        target,
        names: new Set([exported.name]),
        entrypoints: new Map([[entrypoint.name, runtime]]),
      });
    } else {
      existing.names.add(exported.name);
      existing.entrypoints.set(
        entrypoint.name,
        existing.entrypoints.get(entrypoint.name) === true || runtime,
      );
    }
  }
}

await verifyRuntimeExports();

const publicSymbols = [...records.values()].map((record) => {
  const declaration = record.target.valueDeclaration ?? record.target.getDeclarations()?.[0];
  if (declaration === undefined) throw new Error(`Public symbol ${record.target.name} has no declaration.`);
  const names = [...record.names].sort(codeUnitCompare);
  const availability = [...record.entrypoints].sort(([left], [right]) => codeUnitCompare(left, right));
  return {
    name: names[0],
    aliases: names.slice(1),
    owner: owningEntrypoint(availability.map(([entrypoint]) => entrypoint)),
    availability,
    kind: declarationKind(declaration),
    signature: declarationSignature(record.target, declaration),
    declaration,
    target: record.target,
    description: ts.displayPartsToString(record.target.getDocumentationComment(checker)),
    stability: symbolStability(record.target),
    source: sourcePath(declaration),
  };
}).sort((left, right) =>
  codeUnitCompare(left.owner, right.owner) || codeUnitCompare(left.name, right.name)
);

const generated = renderReference(publicSymbols, componentStyling);
const overview = renderOverview();
if (check) {
  const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
  const currentOverview = await fs.readFile(overviewPath, 'utf8').catch(() => '');
  if (current !== generated) {
    throw new Error('docs/api/reference.md is stale; run npm run docs:api.');
  }
  if (currentOverview !== overview) {
    throw new Error('docs/api/index.md is stale; run npm run docs:api.');
  }
} else {
  await fs.writeFile(outputPath, generated, 'utf8');
  await fs.writeFile(overviewPath, overview, 'utf8');
}

function resolveAlias(symbol) {
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
}

function runtimeExportNames(source, visiting = new Set()) {
  if (source === undefined || visiting.has(source.fileName)) return new Set();
  visiting.add(source.fileName);
  const names = new Set();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) names.add(element.name.text);
        }
        continue;
      }
      if (statement.exportClause !== undefined && ts.isNamespaceExport(statement.exportClause)) {
        names.add(statement.exportClause.name.text);
        continue;
      }
      if (statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
        const resolved = ts.resolveModuleName(
          statement.moduleSpecifier.text,
          source.fileName,
          program.getCompilerOptions(),
          ts.sys,
        ).resolvedModule?.resolvedFileName;
        if (resolved !== undefined) {
          for (const name of runtimeExportNames(program.getSourceFile(resolved), visiting)) names.add(name);
        }
      }
      continue;
    }
    if (!hasExportModifier(statement)) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      if (statement.name !== undefined) names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
      }
    }
  }
  visiting.delete(source.fileName);
  return names;
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function collectBindingNames(name, output) {
  if (ts.isIdentifier(name)) {
    output.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, output);
  }
}

async function verifyRuntimeExports() {
  for (const entrypoint of entrypoints) {
    const namespace = await import(pathToFileURL(entrypoint.runtimeFile).href);
    const declared = runtimeNamesByEntrypoint.get(entrypoint.name) ?? new Set();
    for (const name of declared) {
      if (!(name in namespace)) {
        throw new Error(`Runtime export ${name} is missing from ${entrypoint.name}.`);
      }
    }
  }
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
    return `type ${symbol.name} = ${declaration.type.getText(declaration.getSourceFile())}`;
  }
  return `${declarationKind(declaration)} ${symbol.name}`;
}

function componentStylingContracts() {
  const entrypoint = entrypoints.find((candidate) => candidate.name === './components');
  const source = entrypoint === undefined ? undefined : program.getSourceFile(entrypoint.file);
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined || entrypoint === undefined) return [];
  const runtimeNames = runtimeNamesByEntrypoint.get(entrypoint.name) ?? new Set();
  return checker.getExportsOfModule(moduleSymbol).flatMap((exported) => {
    if (!runtimeNames.has(exported.name)) return [];
    const target = resolveAlias(exported);
    const declaration = target.valueDeclaration ?? target.getDeclarations()?.[0];
    if (declaration === undefined) return [];
    const signatures = checker.getTypeOfSymbolAtLocation(target, declaration).getCallSignatures();
    if (!signatures.some((signature) => isElementType(signature.getReturnType()))) return [];
    const parts = new Set();
    const states = new Set();
    for (const signature of signatures) {
      for (const parameter of signature.parameters) {
        const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
        for (const branch of parameterType.isUnion() ? parameterType.types : [parameterType]) {
          collectStyleKeys(branch, declaration, parts, states);
        }
      }
    }
    return [{ name: exported.name, parts: [...parts].sort(codeUnitCompare), states: [...states].sort(codeUnitCompare) }];
  }).sort((left, right) => codeUnitCompare(left.name, right.name));
}

function isElementType(type) {
  return type.aliasSymbol?.name === 'Element'
    || checker.typeToString(type).startsWith('Element<');
}

function collectStyleKeys(type, declaration, parts, states) {
  const stylesProperty = type.getProperty('styles');
  if (stylesProperty === undefined) return;
  const stylesType = checker.getNonNullableType(
    checker.getTypeOfSymbolAtLocation(stylesProperty, declaration),
  );
  collectPropertyKeys(stylesType, 'parts', declaration, parts);
  collectPropertyKeys(stylesType, 'states', declaration, states);
}

function collectPropertyKeys(type, propertyName, declaration, output) {
  const property = type.getProperty(propertyName);
  if (property === undefined) return;
  const propertyType = checker.getNonNullableType(
    checker.getTypeOfSymbolAtLocation(property, declaration),
  );
  for (const key of propertyType.getProperties()) output.add(key.name);
}

function symbolStability(symbol) {
  const declarations = symbol.getDeclarations() ?? [];
  const graphicsPreview = declarations.some((declaration) => {
    const source = sourcePath(declaration);
    return source.startsWith('src/graphics/')
      || (source === 'src/components/drawing/definition.ts' && symbol.name === 'image');
  });
  if (graphicsPreview) return 'experimental';
  const tags = declarations.flatMap((declaration) =>
    ts.getJSDocTags(declaration).map((tag) => tag.tagName.text)
  );
  if (tags.includes('experimental')) return 'experimental';
  if (tags.includes('beta')) return 'beta';
  if (tags.includes('stable')) return 'stable';
  return 'beta';
}

function sourcePath(declaration) {
  const declarationPath = path.relative(projectRoot, declaration.getSourceFile().fileName)
    .split(path.sep).join('/');
  return declarationPath.startsWith('dist/')
    ? `src/${declarationPath.slice('dist/'.length).replace(/\.d\.ts$/u, '.ts')}`
    : declarationPath;
}

function renderReference(symbols, stylingContracts) {
  const lines = [
    '# API reference',
    '',
    '<!-- Generated by scripts/generate-api-reference.mjs. Do not edit by hand. -->',
    '',
    'Find an entrypoint in the [API overview](./index.md), then follow a symbol below.',
    'Each declaration appears under one owning entrypoint; its other import paths are listed with it.',
    'See [API stability](../guides/api-stability.md) for stability labels.',
    '',
    '## Symbols',
    '',
  ];
  const names = new Set(symbols.map((symbol) => symbol.name));
  for (const entrypoint of entrypoints) {
    const owned = symbols.filter((symbol) => symbol.owner === entrypoint.name);
    if (owned.length === 0) continue;
    lines.push(`### ${packageName(entrypoint.name)}`, '');
    for (let index = 0; index < owned.length; index += 8) {
      lines.push('- ' + owned.slice(index, index + 8)
        .map((symbol) => '[`' + symbol.name + '`](#' + symbolAnchor(symbol) + ')').join(', '));
    }
    lines.push('');
  }
  lines.push(
    '## Component styling',
    '',
    'This table is generated from each component factory\'s exact `styles` parameter type.',
    'A dash means the component does not expose local cell styling.',
    '',
    '| Component | Parts | Visual states |',
    '| --- | --- | --- |',
    ...stylingContracts.map((contract) =>
      `| \`${escapeTable(contract.name)}()\` | ${contract.parts.length === 0 ? '—' : contract.parts.map((part) => `\`${escapeTable(part)}\``).join(', ')} | ${contract.states.length === 0 ? '—' : contract.states.map((state) => `\`${escapeTable(state)}\``).join(', ')} |`
    ),
    '',
  );
  let owner;
  for (const symbol of symbols) {
    if (symbol.owner !== owner) {
      owner = symbol.owner;
      lines.push(`## ${packageName(owner)}`, '');
    }
    lines.push(`<a id="${symbolAnchor(symbol)}"></a>`, `### ${symbol.name}`, '');
    lines.push(`${symbol.kind} · ${symbol.stability} · [source](../../${symbol.source})`, '');
    lines.push(`Import from: ${symbol.availability.map(([entrypoint, runtime]) =>
      `\`${packageName(entrypoint)}\`${runtime ? '' : ' (type only)'}`).join(', ')}`, '');
    if (symbol.aliases.length > 0) lines.push(`Also exported as: ${symbol.aliases.map((alias) => `\`${alias}\``).join(', ')}`, '');
    if (symbol.description !== '') lines.push(symbol.description, '');
    for (const declaration of publicDeclarations(symbol)) {
      if (ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration)) {
        lines.push('```ts', declarationHeader(declaration), '```', '');
        const memberOccurrences = new Map();
        for (const member of declaration.members) {
          if (!publicMember(member)) continue;
          const name = member.name?.getText(member.getSourceFile()) ?? 'constructor';
          const occurrence = memberOccurrences.get(name) ?? 0;
          memberOccurrences.set(name, occurrence + 1);
          const memberAnchor = `${symbolAnchor(symbol)}-${name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}${occurrence === 0 ? '' : `-${String(occurrence + 1)}`}`;
          lines.push(`<a id="${memberAnchor}"></a>`, `#### ${name}`, '');
          const documentation = member.name === undefined ? '' : ts.displayPartsToString(
            checker.getSymbolAtLocation(member.name)?.getDocumentationComment(checker) ?? [],
          );
          if (documentation !== '') lines.push(documentation, '');
          lines.push('```ts', readableSignature(member), '```', '');
        }
      } else {
        lines.push('```ts', readableSignature(declaration), '```', '');
      }
    }
    const referenced = [...names]
      .filter((name) => name !== symbol.name && new RegExp(`\\b${escapeRegExp(name)}\\b`, 'u').test(symbol.signature))
      .slice(0, 16);
    if (referenced.length > 0) {
      lines.push(`Related types: ${referenced.map((name) => {
        const target = symbols.find((candidate) => candidate.name === name);
        return target === undefined ? `\`${name}\`` : `[\`${name}\`](#${symbolAnchor(target)})`;
      }).join(', ')}`, '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function publicDeclarations(symbol) {
  const declarations = symbol.target.getDeclarations() ?? [];
  const owned = declarations.filter((declaration) => sourcePath(declaration) === symbol.source);
  return owned.length > 0 ? owned : [symbol.declaration];
}

function declarationHeader(declaration) {
  const source = declaration.getText(declaration.getSourceFile());
  const brace = source.indexOf('{');
  return brace < 0 ? source : `${source.slice(0, brace).trimEnd()} { … }`;
}

function readableSignature(declaration) {
  const sourceFile = declaration.getSourceFile();
  let source = declaration.getText(sourceFile);
  if (source.length <= 140 || declaration.parameters === undefined) return source;
  const offset = declaration.getStart(sourceFile);
  const lists = [declaration.parameters, declaration.typeParameters]
    .filter((list) => list !== undefined && list.length > 0)
    .sort((left, right) => right.pos - left.pos);
  for (const list of lists) {
    const start = list.pos - offset;
    const end = list.end - offset;
    const entries = list.map((entry) => entry.getText(sourceFile));
    source = `${source.slice(0, start)}\n  ${entries.join(',\n  ')}\n${source.slice(end)}`;
  }
  return source;
}

function publicMember(member) {
  return (member.name === undefined || !ts.isPrivateIdentifier(member.name))
    && !member.modifiers?.some((modifier) =>
    modifier.kind === ts.SyntaxKind.PrivateKeyword
      || modifier.kind === ts.SyntaxKind.ProtectedKeyword);
}

function symbolAnchor(symbol) {
  const owner = symbol.owner === '.' ? 'root'
    : symbol.owner.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '');
  return `${owner}-${symbol.name.toLowerCase()}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function renderOverview() {
  return [
    '# API entrypoints',
    '',
    '<!-- Generated by scripts/generate-api-reference.mjs. Do not edit by hand. -->',
    '',
    'Import app building blocks from the package root. Use a focused entrypoint when working with a specific layer.',
    'Methods on a returned runtime or canvas are called on that value; they are not separate package exports.',
    'For signatures and public members, use the [API reference](./reference.md).',
    '',
    '| Import path | Declarations |',
    '| --- | ---: |',
    ...entrypoints.map((entrypoint) => [
      `| \`${packageName(entrypoint.name)}\` |`,
      publicSymbols.filter((symbol) => symbol.availability.some(([name]) => name === entrypoint.name)).length,
      '|',
    ].join(' ')),
    '',
    'Start with [building a terminal app](../guides/building-terminal-apps.md),',
    '[prompts](../guides/prompts.md), [components](../guides/components.md),',
    'or [component definitions](../guides/component-definitions.md).',
    '',
  ].join('\n');
}

function packageName(entrypoint) {
  return `${manifest.name}${entrypoint === '.' ? '' : entrypoint.slice(1)}`;
}

function escapeTable(value) {
  return value.replaceAll('|', '\\|');
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
