import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { globFiles } from './glob-files.mjs';

const root = path.resolve(import.meta.dirname, '../src');
const sourceFiles = await collectTypeScript(root);
const knownSourceFiles = new Set(sourceFiles);
const componentCatalogModules = await loadComponentCatalogModules(knownSourceFiles);
const publicEntrypointFiles = await loadPublicEntrypoints();
const compilerConfig = loadCompilerConfig();
const publicDeclarationSurface = createPublicDeclarationSurface(compilerConfig, publicEntrypointFiles);
const dependencyGraph = new Map();
const failures = [];
const deterministicGlobalLayers = new Set([
  'behavior',
  'component',
  'components',
  'layout',
  'renderer',
  'ui-model',
  'visual'
]);
const timerRestrictedLayers = new Set([...deterministicGlobalLayers, 'tui']);
const componentForbiddenLayers = new Set([
  'components',
  'host',
  'protocol',
  'testing',
  'transcript',
  'tui'
]);
const componentDefinitionPrivateRendererDependencies = new Set([
  'renderer/model/component-node.ts'
]);
const typedNormalizationPaths = new Set([
  'host/memory.ts', 'host/terminal-state.ts', 'input/decoder.ts', 'input/pipeline.ts',
  'layout/prepare.ts', 'protocol/index.ts', 'protocol/keyboard.ts',
  'tui/definition.ts', 'tui/run-configuration.ts'
]);
const runtimeGlobalNames = new Set(['Bun', 'Deno', 'globalThis', 'process']);
const foundationDependencies = new Map([
  ['diagnostic-identity.ts', new Set()],
  ['diagnostics.ts', new Set(['diagnostic-identity.ts', 'foundation', 'text'])],
  ['foundation', new Set()],
  ['geometry', new Set(['foundation'])],
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
    if (knownSourceFiles.has(target) && !isTypeOnlyDependency(statement)) dependencies.push(target);
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
  inspectElementConstructionBoundary(sourceFile, filePath);
  inspectComponentCatalog(sourceFile, filePath);
  inspectComponentPreparationInflation(sourceFile, filePath);
  inspectTypedNormalizationInflation(sourceFile, filePath);
  inspectPublicBoundary(sourceFile, filePath);
  inspectTestingEntrypoint(sourceFile, filePath);
  inspectTuiContext(sourceFile, filePath);
}

inspectPublicExportGraph(publicDeclarationSurface, publicEntrypointFiles);

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

function inspectElementConstructionBoundary(sourceFile, filePath) {
  const sourcePath = sourceRelative(filePath);
  const constructors = new Set([
    'componentElementFromRenderNode',
    'layoutElementFromRenderNode'
  ]);
  const expected = sourcePath === 'component/definition.ts'
    ? 'componentElementFromRenderNode'
    : sourcePath.startsWith('layout/factories/')
      && !sourcePath.endsWith('/index.ts')
      && !sourcePath.endsWith('/internals.ts')
      ? 'layoutElementFromRenderNode'
      : undefined;

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

function inspectComponentCatalog(sourceFile, filePath) {
  if (!componentCatalogModules.has(filePath)) return;
  let definesComponent = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'defineComponent') {
      definesComponent = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!definesComponent) {
    failures.push(`${relative(filePath)} does not author its catalog entries through defineComponent`);
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const targetPath = sourceRelative(path.resolve(path.dirname(filePath), specifier.text));
    if (targetPath.startsWith('renderer/internal/') || targetPath.startsWith('renderer/model/')) {
      failures.push(`${relative(filePath)} imports renderer-private module ${targetPath}`);
    }
  }
}

function inspectComponentPreparationInflation(sourceFile, filePath) {
  const sourcePath = sourceRelative(filePath);
  if (!sourcePath.startsWith('components/factories/')) return;

  const report = (message) => failures.push(`${relative(filePath)} ${message}`);
  const visit = (node) => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))
      && /^Dynamic.*Options$/u.test(node.name.text)) {
      report(`declares erased option mirror ${node.name.text}`);
    }
    if (ts.isInterfaceDeclaration(node) && /Options$/u.test(node.name.text)
      && node.members.length > 0
      && node.members.every((member) => ts.isPropertySignature(member)
        && member.type?.kind === ts.SyntaxKind.UnknownKeyword)) {
      report(`declares all-unknown option mirror ${node.name.text}`);
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined
      && /^(exact|exactOptions|rejectUnknownOptions)$/u.test(node.name.text)) {
      report(`declares generic exact-option helper ${node.name.text}`);
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined
      && /^prepare[A-Z]/u.test(node.name.text)
      && node.parameters[0]?.type !== undefined
      && isReadonlyUnknownRecord(node.parameters[0].type)) {
      report(`types ${node.name.text}() as Readonly<Record<string, unknown>>`);
    }
    if ((ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node))
      && propertyName(node.name) === 'prepare') {
      const callable = ts.isMethodDeclaration(node)
        ? node
        : ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)
          ? node.initializer
          : undefined;
      if (callable?.parameters[0]?.type !== undefined
        && isReadonlyUnknownRecord(callable.parameters[0].type)) {
        report('types a component prepare hook as Readonly<Record<string, unknown>>');
      }
    }
    if (ts.isVariableDeclaration(node) && node.type !== undefined
      && isReadonlyUnknownRecord(node.type)
      && node.initializer !== undefined && ts.isIdentifier(node.initializer)
      && node.initializer.text === 'options') {
      report(`widens options to a generic record in ${node.name.getText(sourceFile)}`);
    }
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const callee = node.expression.expression;
      const name = ts.isIdentifier(callee) ? callee.text : undefined;
      if (name !== undefined && /^prepare[A-Z]/u.test(name)) {
        report(`discards the result of ${name}()`);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && /^(?:nonNegativeSafeInteger|nonNegativeInteger)$/u.test(node.expression.text)
      && node.arguments.some((argument) => ts.isPropertyAccessExpression(argument)
        && /^(?:itemIndex|startIndex|totalCount)$/u.test(argument.name.text))) {
      report('revalidates a branded collection index');
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'isNonArrayObject'
      && node.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === 'record')) {
      report('revalidates the generic shape of a branded collection record');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (/(^|\/)options(?:\.ts)?$/u.test(statement.moduleSpecifier.text)
      && statement.importClause?.namedBindings !== undefined
      && ts.isNamedImports(statement.importClause.namedBindings)
      && statement.importClause.namedBindings.elements.some((item) =>
        /^(assertKnownOptions|exactOptions|rejectUnknownOptions)$/u.test(item.name.text)
      )) {
      report(`imports generic exact-option validation from ${statement.moduleSpecifier.text}`);
    }
  }
}

function inspectTypedNormalizationInflation(sourceFile, filePath) {
  const sourcePath = sourceRelative(filePath);
  const typedPath = typedNormalizationPaths.has(sourcePath);
  if (!typedPath && sourcePath !== 'transcript/recorder.ts') return;
  const report = (message) => failures.push(`${relative(filePath)} ${message}`);
  const visit = (node) => {
    if (typedPath && ts.isVariableDeclaration(node) && node.initializer !== undefined
      && ts.isIdentifier(node.initializer)
      && node.type !== undefined
      && (node.type.kind === ts.SyntaxKind.UnknownKeyword || isReadonlyUnknownRecord(node.type))
      && !(sourcePath === 'input/decoder.ts' && node.initializer.text === 'chunk')) {
      report(`widens ${node.initializer.text} before typed normalization`);
    }
    if (typedPath && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && /Fields$/u.test(node.name.text) && node.initializer !== undefined && ts.isNewExpression(node.initializer)
      && node.initializer.expression.getText(sourceFile) === 'Set') {
      report(`maintains exact authoring-field mirror ${node.name.text}`);
    }
    if (sourcePath === 'transcript/recorder.ts' && ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === 'decodeInputEvent') {
      report('decodes an already admitted input event');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function propertyName(name) {
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined;
}

function isReadonlyUnknownRecord(node) {
  if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)
    || node.typeName.text !== 'Readonly' || node.typeArguments?.length !== 1) return false;
  const record = node.typeArguments[0];
  return ts.isTypeReferenceNode(record) && ts.isIdentifier(record.typeName)
    && record.typeName.text === 'Record' && record.typeArguments?.length === 2
    && record.typeArguments[0]?.kind === ts.SyntaxKind.StringKeyword
    && record.typeArguments[1]?.kind === ts.SyntaxKind.UnknownKeyword;
}

async function loadComponentCatalogModules(knownFiles) {
  const entrypoint = path.resolve(root, 'components/factories.ts');
  const sourceText = await fs.readFile(entrypoint, 'utf8');
  const sourceFile = ts.createSourceFile(
    entrypoint,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const modules = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = path.resolve(path.dirname(entrypoint), specifier.text);
    if (knownFiles.has(target)) modules.add(target);
  }
  return modules;
}

function isTypeOnlyDependency(statement) {
  if (statement.isTypeOnly === true) return true;
  if (!ts.isImportDeclaration(statement)) return false;
  const clause = statement.importClause;
  if (clause?.isTypeOnly === true) return true;
  if (clause?.name !== undefined || clause?.namedBindings === undefined
    || !ts.isNamedImports(clause.namedBindings)) return false;
  return clause.namedBindings.elements.length > 0
    && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function inspectPublicBoundary(sourceFile, filePath) {
  const sourcePath = sourceRelative(filePath);
  if (sourcePath === 'renderer/index.ts') {
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (specifier === undefined || !ts.isStringLiteral(specifier)) continue;
      if (specifier.text.startsWith('./model/')) {
        failures.push(`src/renderer/index.ts exposes private model module ${specifier.text}`);
      }
      if (specifier.text.startsWith('./internal/') && (
        ts.isImportDeclaration(statement)
        || statement.exportClause === undefined
        || !ts.isNamedExports(statement.exportClause)
      )) {
        failures.push(`src/renderer/index.ts must name every public symbol exported from ${specifier.text}`);
      }
    }
    return;
  }

  const isEntrypoint = sourcePath === 'index.ts'
    || (sourcePath.endsWith('/index.ts') && sourcePath.split('/').length === 2);
  if (!isEntrypoint) return;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const targetPath = sourceRelative(path.resolve(path.dirname(filePath), specifier.text));
    if (targetPath.includes('/internal/') || targetPath.includes('/model/')) {
      failures.push(`${relative(filePath)} exposes package-private dependency ${targetPath}`);
    }
  }
}

function inspectPublicExportGraph(surface, entrypointFiles) {
  const { program, declarationFiles, declarationRoot } = surface;
  const checker = program.getTypeChecker();
  const entrypoints = program.getSourceFiles().filter((sourceFile) =>
    entrypointFiles.has(path.resolve(sourceFile.fileName)));

  for (const entrypoint of entrypointFiles) {
    if (!declarationFiles.has(entrypoint)) {
      failures.push(`public declaration entrypoint was not emitted: ${path.relative(path.dirname(root), entrypoint)}`);
    }
  }
  for (const entrypoint of entrypoints) {
    const moduleSymbol = checker.getSymbolAtLocation(entrypoint);
    if (moduleSymbol === undefined) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const target = resolveAlias(exported, checker);
      const dependency = [...privateModelDependencies(
        target,
        checker,
        declarationFiles,
        declarationRoot
      )].sort()[0];
      if (dependency !== undefined) {
        failures.push(
          `${path.relative(path.dirname(root), entrypoint.fileName)} public export ${exported.name} exposes private renderer model declaration ${dependency}`
        );
      }
    }
  }
}

function privateModelDependencies(rootSymbol, checker, declarationFiles, declarationRoot) {
  const dependencies = new Set();
  const seenSymbols = new Set();

  visitSymbol(rootSymbol);
  return dependencies;

  function visitSymbol(symbol) {
    const target = resolveAlias(symbol, checker);
    if (seenSymbols.has(target)) return;
    seenSymbols.add(target);
    const declarations = (target.getDeclarations() ?? []).filter((declaration) =>
      declarationFiles.has(path.resolve(declaration.getSourceFile().fileName)));
    for (const declaration of declarations) recordPrivateDeclaration(declaration);
    if ((target.flags & ts.SymbolFlags.Module) !== 0) {
      for (const exported of checker.getExportsOfModule(target)) visitSymbol(exported);
      return;
    }
    for (const declaration of declarations) visitDeclaration(declaration);
  }

  function visitDeclaration(node) {
    if (ts.isIdentifier(node) && !isNamespaceQualifier(node)) {
      const referenced = checker.getSymbolAtLocation(node);
      if (referenced !== undefined) visitSymbol(referenced);
    }
    ts.forEachChild(node, visitDeclaration);
  }

  function recordPrivateDeclaration(declaration) {
    const declarationPath = path.relative(
      declarationRoot,
      path.resolve(declaration.getSourceFile().fileName)
    ).split(path.sep).join('/');
    if (declarationPath.startsWith('renderer/model/')) {
      dependencies.add(`dist/${declarationPath}`);
    }
  }
}

function isNamespaceQualifier(node) {
  return ts.isQualifiedName(node.parent) && node.parent.left === node;
}

function resolveAlias(symbol, checker) {
  let current = symbol;
  const seen = new Set();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    const resolved = checker.getAliasedSymbol(current);
    if (resolved === current) break;
    current = resolved;
  }
  return current;
}

function loadCompilerConfig() {
  const configPath = path.resolve(import.meta.dirname, '../tsconfig.json');
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), {}, configPath);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  }
  return parsed;
}

function createPublicDeclarationSurface(configuration, entrypointFiles) {
  const declarationOptions = {
    ...configuration.options,
    declaration: false,
    declarationMap: false,
    noEmit: true,
    sourceMap: false
  };
  const program = ts.createProgram({
    rootNames: [...entrypointFiles],
    options: declarationOptions
  });
  const declarationDiagnostics = ts.getPreEmitDiagnostics(program);
  if (declarationDiagnostics.length > 0) {
    throw new Error(declarationDiagnostics.map((item) =>
      ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  }
  const declarationRoot = path.resolve(configuration.options.outDir);
  const declarationFiles = new Set(program.getSourceFiles()
    .map((sourceFile) => path.resolve(sourceFile.fileName))
    .filter((fileName) =>
      fileName.endsWith('.d.ts')
      && fileName.startsWith(`${declarationRoot}${path.sep}`)));
  return {
    program,
    declarationFiles,
    declarationRoot
  };
}

async function loadPublicEntrypoints() {
  const manifestPath = path.resolve(import.meta.dirname, '../package.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const entrypoints = new Set();
  for (const configuration of Object.values(manifest.exports ?? {})) {
    const declarationPath = configuration?.types;
    if (typeof declarationPath !== 'string' || declarationPath.includes('*')) continue;
    if (!declarationPath.startsWith('./dist/') || !declarationPath.endsWith('.d.ts')) {
      throw new Error(`Unsupported public declaration entrypoint ${declarationPath}.`);
    }
    entrypoints.add(path.resolve(path.dirname(manifestPath), declarationPath));
  }
  return entrypoints;
}

function inspectTestingEntrypoint(sourceFile, filePath) {
  if (sourceRelative(filePath) !== 'testing/index.ts') return;
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('..')) continue;
    const target = path.resolve(path.dirname(filePath), specifier.text);
    const targetPath = sourceRelative(target);
    if (!targetPath.endsWith('/index.ts')) {
      failures.push(`src/testing/index.ts exports package-private module ${targetPath}`);
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
  const upper = new Set(['component', 'components', 'layout', 'renderer', 'testing', 'transcript', 'tui']);
  if (sourceLayer === 'visual' && new Set(['behavior', 'interaction', 'ui-model']).has(targetLayer)) return true;
  if (sourceLayer === 'interaction' && new Set(['behavior', 'ui-model']).has(targetLayer)) return true;
  if (sourceLayer === 'ui-model' && targetLayer === 'behavior') return true;
  if (sourceRelative(sourceFile).startsWith('renderer/model/')
    && sourceRelative(targetFile).startsWith('renderer/internal/')) return true;
  if (neutral.has(sourceLayer) && upper.has(targetLayer)) return true;
  if (sourceLayer === 'component') {
    if (componentForbiddenLayers.has(targetLayer)) return true;
    if (targetLayer === 'renderer') {
      const sourcePath = sourceRelative(sourceFile);
      const targetPath = sourceRelative(targetFile);
      if (targetPath === 'renderer/contracts.ts') return false;
      if (sourcePath !== 'component/definition.ts') return true;
      return !componentDefinitionPrivateRendererDependencies.has(targetPath);
    }
  }
  if (sourceLayer === 'components' && targetLayer === 'tui') return true;
  if (sourceLayer === 'components' && targetLayer === 'renderer'
    && (sourceRelative(targetFile).startsWith('renderer/internal/')
      || sourceRelative(targetFile).startsWith('renderer/model/'))) return true;
  if (sourceLayer === 'layout' && new Set(['components', 'tui']).has(targetLayer)) return true;
  if (sourceLayer === 'layout' && targetLayer === 'renderer'
    && sourceRelative(targetFile).startsWith('renderer/internal/')) return true;
  if (sourceLayer === 'renderer' && new Set(['components', 'layout', 'tui']).has(targetLayer)) return true;
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
  const patterns = ['**/*.ts', '.*/**/*.ts', '**/.*/**/*.ts'];
  return globFiles(directory, patterns);
}
