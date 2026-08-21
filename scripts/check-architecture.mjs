import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = architectureProjectRoot(process.argv.slice(2));
const root = path.resolve(projectRoot, 'src');
const compilerConfig = loadCompilerConfig();
const sourceProgram = ts.createProgram({
  rootNames: compilerConfig.fileNames,
  options: compilerConfig.options
});
const checker = sourceProgram.getTypeChecker();
const sourceFiles = sourceProgram.getSourceFiles()
  .map((sourceFile) => path.resolve(sourceFile.fileName))
  .filter((filePath) => filePath.startsWith(`${root}${path.sep}`))
  .sort();
const knownSourceFiles = new Set(sourceFiles);
const publicEntrypoints = await loadPublicEntrypoints(knownSourceFiles);
const componentCatalogExports = loadComponentCatalogExports(sourceProgram, checker);
const publicDeclarationSurface = createPublicDeclarationSurface(
  compilerConfig,
  publicEntrypoints.declarations
);
const runtimeDependencyGraph = new Map();
const architectureDependencyGraph = new Map();
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
const componentDefinitionPrivateRendererDependencies = new Set([
  'renderer/model/component-node.ts'
]);
const componentSharedRendererDependencies = new Set([
  'renderer/contracts.ts',
  'renderer/measurement.ts',
]);
const runtimeGlobalNames = new Set(['Bun', 'Deno', 'globalThis', 'process']);
const ambientRuntimeNames = new Set([
  ...runtimeGlobalNames,
  'Array',
  'Date',
  'Math',
  'Object',
  'Reflect',
  'crypto',
  'performance',
  'setImmediate',
  'setInterval',
  'setTimeout'
]);
const architectureDependencies = new Map([
  ['accessibility', new Set(['diagnostics.ts', 'foundation', 'result.ts', 'text'])],
  ['behavior', new Set(['foundation', 'interaction', 'text', 'ui-model'])],
  ['component', new Set([
    'accessibility', 'behavior', 'element', 'foundation', 'geometry', 'input',
    'interaction', 'renderer', 'text', 'theme', 'ui-model', 'visual'
  ])],
  ['components', new Set([
    'accessibility', 'behavior', 'component', 'element', 'foundation', 'geometry',
    'graphics', 'input', 'interaction', 'layout', 'renderer', 'text', 'theme',
    'ui-model', 'visual'
  ])],
  ['diagnostic-identity.ts', new Set()],
  ['diagnostics.ts', new Set(['diagnostic-identity.ts', 'foundation', 'text'])],
  ['element', new Set(['accessibility', 'foundation', 'input', 'interaction', 'visual'])],
  ['errors.ts', new Set()],
  ['foundation', new Set()],
  ['geometry', new Set(['foundation'])],
  ['graphics', new Set(['diagnostic-identity.ts', 'foundation', 'geometry'])],
  ['host', new Set(['diagnostics.ts', 'errors.ts', 'geometry', 'protocol', 'text'])],
  ['index.ts', new Set([
    'behavior', 'component', 'components', 'diagnostics.ts', 'element', 'errors.ts',
    'foundation', 'graphics', 'host', 'interaction', 'layout', 'result.ts', 'tui',
    'ui-model', 'visual'
  ])],
  ['input', new Set(['diagnostics.ts', 'foundation', 'host', 'protocol', 'text'])],
  ['interaction', new Set(['diagnostics.ts', 'foundation', 'geometry', 'input', 'text'])],
  ['layout', new Set([
    'behavior', 'element', 'foundation', 'geometry', 'interaction', 'renderer',
    'ui-model', 'visual'
  ])],
  ['prompts', new Set([
    'accessibility', 'diagnostics.ts', 'foundation', 'host', 'input', 'renderer',
    'text', 'theme', 'transcript', 'visual'
  ])],
  ['protocol', new Set(['diagnostics.ts', 'foundation', 'geometry', 'graphics', 'text'])],
  ['renderer', new Set([
    'accessibility', 'behavior', 'diagnostics.ts', 'element', 'foundation', 'geometry', 'graphics',
    'input', 'interaction', 'protocol', 'text', 'theme', 'ui-model', 'visual'
  ])],
  ['result.ts', new Set(['diagnostics.ts'])],
  ['testing', new Set([
    'accessibility', 'diagnostics.ts', 'element', 'foundation', 'host', 'input',
    'interaction', 'renderer', 'text', 'theme', 'transcript'
  ])],
  ['text', new Set()],
  ['theme', new Set(['text', 'visual'])],
  ['transcript', new Set([
    'accessibility', 'diagnostics.ts', 'foundation', 'graphics', 'host', 'input',
    'interaction', 'protocol', 'renderer', 'result.ts', 'text', 'visual'
  ])],
  ['tui', new Set([
    'accessibility', 'behavior', 'diagnostics.ts', 'element', 'errors.ts', 'foundation',
    'geometry', 'graphics', 'host', 'input', 'interaction', 'protocol', 'renderer',
    'text', 'theme', 'transcript'
  ])],
  ['ui-model', new Set(['element', 'foundation', 'geometry', 'input', 'interaction', 'text', 'visual'])],
  ['visual', new Set(['foundation', 'text'])]
]);
const externalRuntimeDependencies = new Map([
  ['diagnostic-identity.ts', new Set(['node:crypto'])],
  ['host', new Set(['node:process'])],
  ['protocol', new Set(['node:buffer'])]
]);

for (const filePath of sourceFiles) {
  const sourceFile = sourceProgram.getSourceFile(filePath);
  if (sourceFile === undefined) throw new Error(`Compiler omitted ${relative(filePath)}.`);
  const sourceLayer = architectureUnit(filePath);
  if (!architectureDependencies.has(sourceLayer)) {
    failures.push(`${relative(filePath)} belongs to unclassified architecture unit ${String(sourceLayer)}`);
  }
  const runtimeDependencies = new Set();
  const architectureDependenciesForFile = new Set();
  for (const dependency of collectModuleDependencies(sourceFile, compilerConfig.options)) {
    if (dependency.target === undefined) {
      inspectExternalDependency(filePath, sourceLayer, dependency);
      continue;
    }
    architectureDependenciesForFile.add(dependency.target);
    if (dependency.kind !== 'type') runtimeDependencies.add(dependency.target);
    inspectDependencyAuthority(filePath, sourceLayer, dependency);
    if (dependency.target === filePath) {
      failures.push(`${relative(filePath)} imports itself through ${dependency.specifier}`);
    }
  }
  runtimeDependencyGraph.set(filePath, runtimeDependencies);
  architectureDependencyGraph.set(filePath, architectureDependenciesForFile);
  inspectDeterministicGlobals(sourceFile, sourceLayer, filePath);
  inspectPublicBoundary(sourceFile, filePath, publicEntrypoints.sources);
}

inspectComponentCatalog(componentCatalogExports);
inspectPublicExportGraph(publicDeclarationSurface, publicEntrypoints.declarations);

const runtimeCycles = reportRuntimeCycles(runtimeDependencyGraph);
reportArchitecturalCycles(architectureDependencyGraph, runtimeCycles);

if (failures.length > 0) throw new Error(`Architecture contract failed:\n${failures.join('\n')}`);

function inspectDeterministicGlobals(sourceFile, sourceLayer, filePath) {
  const restrictGlobals = deterministicGlobalLayers.has(sourceLayer);
  const restrictTimers = timerRestrictedLayers.has(sourceLayer);
  if (!restrictGlobals && !restrictTimers) return;
  const handledIdentifiers = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const identity = runtimeExpressionIdentity(node.expression, new Set());
      if (restrictTimers && isTimerIdentity(identity)) {
        markExpressionIdentifiers(node.expression, handledIdentifiers);
        failures.push(`${relative(filePath)} creates a raw timer in scheduler-controlled layer ${sourceLayer}`);
      } else if (restrictGlobals && isNondeterministicCall(identity, node.arguments.length)) {
        markExpressionIdentifiers(node.expression, handledIdentifiers);
        failures.push(`${relative(filePath)} calls nondeterministic runtime API ${identity} in deterministic layer ${sourceLayer}`);
      }
    }
    if (restrictGlobals && ts.isNewExpression(node) && (node.arguments?.length ?? 0) === 0) {
      const identity = runtimeExpressionIdentity(node.expression, new Set());
      if (identity === 'Date' || identity === 'globalThis.Date') {
        markExpressionIdentifiers(node.expression, handledIdentifiers);
        failures.push(`${relative(filePath)} constructs the current date in deterministic layer ${sourceLayer}`);
      }
    }
    if (restrictGlobals && ts.isIdentifier(node)
      && !handledIdentifiers.has(node)
      && runtimeGlobalNames.has(node.text)
      && isAmbientRuntimeIdentifier(node)) {
      failures.push(`${relative(filePath)} reads ${node.text} runtime-global state in deterministic layer ${sourceLayer}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function runtimeExpressionIdentity(expression, seenSymbols) {
  if (ts.isCallExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && expression.expression.name.text === 'bind') {
    return runtimeExpressionIdentity(expression.expression.expression, seenSymbols);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const base = runtimeExpressionIdentity(expression.expression, seenSymbols);
    return base === undefined ? undefined : `${base}.${expression.name.text}`;
  }
  if (ts.isElementAccessExpression(expression)
    && expression.argumentExpression !== undefined
    && ts.isStringLiteralLike(expression.argumentExpression)) {
    const base = runtimeExpressionIdentity(expression.expression, seenSymbols);
    return base === undefined ? undefined : `${base}.${expression.argumentExpression.text}`;
  }
  if (!ts.isIdentifier(expression)) return undefined;
  const symbol = checker.getSymbolAtLocation(expression);
  if (symbol === undefined) return ambientRuntimeNames.has(expression.text) ? expression.text : undefined;
  if (seenSymbols.has(symbol)) return undefined;
  seenSymbols.add(symbol);
  const imported = importedSymbolIdentity(symbol);
  if (imported !== undefined) return imported;
  if (isAmbientRuntimeIdentifier(expression)) return expression.text;
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const identity = runtimeExpressionIdentity(declaration.initializer, seenSymbols);
      if (identity !== undefined) return identity;
    }
    if (ts.isBindingElement(declaration)) {
      const variable = declaration.parent.parent;
      if (ts.isVariableDeclaration(variable) && variable.initializer !== undefined) {
        const base = runtimeExpressionIdentity(variable.initializer, seenSymbols);
        const name = declaration.propertyName ?? declaration.name;
        if (base !== undefined && ts.isIdentifier(name)) return `${base}.${name.text}`;
      }
    }
  }
  return undefined;
}

function importedSymbolIdentity(symbol) {
  for (const declaration of symbol.getDeclarations() ?? []) {
    const importDeclaration = importDeclarationFor(declaration);
    if (importDeclaration === undefined || !ts.isStringLiteralLike(importDeclaration.moduleSpecifier)) continue;
    const specifier = importDeclaration.moduleSpecifier.text;
    if (ts.isImportSpecifier(declaration)) {
      return `${specifier}.${(declaration.propertyName ?? declaration.name).text}`;
    }
    if (ts.isImportClause(declaration) && declaration.name !== undefined) {
      return `${specifier}.default`;
    }
    if (ts.isNamespaceImport(declaration)) return specifier;
  }
  return undefined;
}

function importDeclarationFor(node) {
  let current = node;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isImportDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isAmbientRuntimeIdentifier(node) {
  const symbol = checker.getSymbolAtLocation(node);
  if (symbol === undefined) return ambientRuntimeNames.has(node.text);
  return (symbol.getDeclarations() ?? []).every((declaration) =>
    !path.resolve(declaration.getSourceFile().fileName).startsWith(`${root}${path.sep}`));
}

function isTimerIdentity(identity) {
  const invoked = directlyInvokedIdentity(identity);
  return invoked === 'setImmediate'
    || invoked === 'setInterval'
    || invoked === 'setTimeout'
    || invoked === 'globalThis.setImmediate'
    || invoked === 'globalThis.setInterval'
    || invoked === 'globalThis.setTimeout'
    || invoked === 'node:timers.setImmediate'
    || invoked === 'node:timers.setInterval'
    || invoked === 'node:timers.setTimeout'
    || invoked === 'node:timers/promises.setImmediate'
    || invoked === 'node:timers/promises.setInterval'
    || invoked === 'node:timers/promises.setTimeout';
}

function isNondeterministicCall(identity, argumentCount) {
  const invoked = directlyInvokedIdentity(identity);
  if ((invoked === 'Date' || invoked === 'globalThis.Date') && argumentCount === 0) return true;
  return invoked === 'Date.now'
    || invoked === 'globalThis.Date.now'
    || invoked === 'performance.now'
    || invoked === 'globalThis.performance.now'
    || invoked === 'Math.random'
    || invoked === 'globalThis.Math.random'
    || invoked === 'crypto.getRandomValues'
    || invoked === 'crypto.randomUUID'
    || invoked === 'globalThis.crypto.getRandomValues'
    || invoked === 'globalThis.crypto.randomUUID'
    || invoked === 'node:crypto.randomBytes'
    || invoked === 'node:crypto.randomFill'
    || invoked === 'node:crypto.randomFillSync'
    || invoked === 'node:crypto.randomInt'
    || invoked === 'node:crypto.randomUUID';
}

function directlyInvokedIdentity(identity) {
  return identity?.endsWith('.call') === true || identity?.endsWith('.apply') === true
    ? identity.slice(0, identity.lastIndexOf('.'))
    : identity;
}

function markExpressionIdentifiers(node, target) {
  if (ts.isIdentifier(node)) target.add(node);
  ts.forEachChild(node, (child) => markExpressionIdentifiers(child, target));
}

function symbolDeclaredIn(symbol, sourcePath, names) {
  return names.has(symbol.name) && (symbol.getDeclarations() ?? []).some((declaration) =>
    sourceRelative(declaration.getSourceFile().fileName) === sourcePath);
}

function inspectComponentCatalog(exports) {
  for (const exported of exports) {
    const declarations = exported.target.getDeclarations() ?? [];
    const origin = declarations.find((declaration) =>
      sourceRelative(declaration.getSourceFile().fileName).startsWith('components/factories/'));
    if (origin === undefined) {
      failures.push(`src/components/factories.ts exports component factory ${exported.name} outside components/factories`);
      continue;
    }
    if (!symbolProducesComponent(exported.target, new Set())) {
      failures.push(`${relative(origin.getSourceFile().fileName)} exports ${exported.name} without constructing it through defineComponent`);
    }
  }
}

function symbolProducesComponent(symbol, seen) {
  const target = resolveAlias(symbol, checker);
  if (seen.has(target)) return false;
  seen.add(target);
  if (symbolDeclaredIn(target, 'component/definition.ts', new Set(['defineComponent']))) return true;
  for (const declaration of target.getDeclarations() ?? []) {
    const declarationPath = sourceRelative(declaration.getSourceFile().fileName);
    if (!declarationPath.startsWith('components/factories/')) continue;
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
        if (functionProducesComponent(declaration.initializer, seen)) return true;
      } else if (expressionProducesComponent(declaration.initializer, seen)) {
        return true;
      }
    }
    if (isFunctionLikeWithBody(declaration) && functionProducesComponent(declaration, seen)) return true;
  }
  return false;
}

function functionProducesComponent(callable, seen) {
  if (!ts.isBlock(callable.body)) return expressionProducesComponent(callable.body, seen);
  const returns = [];
  const visit = (node) => {
    if (node !== callable.body && isFunctionLikeWithBody(node)) return;
    if (ts.isReturnStatement(node)) returns.push(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(callable.body);
  return returns.length > 0
    && returns.every((expression) => expression !== undefined
      && expressionProducesComponent(expression, new Set(seen)));
}

function expressionProducesComponent(expression, seen) {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isNonNullExpression(expression)) {
    return expressionProducesComponent(expression.expression, seen);
  }
  if (ts.isConditionalExpression(expression)) {
    return expressionProducesComponent(expression.whenTrue, new Set(seen))
      && expressionProducesComponent(expression.whenFalse, new Set(seen));
  }
  if (ts.isBinaryExpression(expression)
    && (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      || expression.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    return expressionProducesComponent(expression.left, new Set(seen))
      && expressionProducesComponent(expression.right, new Set(seen));
  }
  if (ts.isCallExpression(expression) || ts.isIdentifier(expression)) {
    const location = ts.isCallExpression(expression) ? expression.expression : expression;
    const symbol = checker.getSymbolAtLocation(location);
    return symbol !== undefined && symbolProducesComponent(symbol, seen);
  }
  return false;
}

function isFunctionLikeWithBody(node) {
  return (ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node))
    && node.body !== undefined;
}

function loadComponentCatalogExports(program, typeChecker) {
  const entrypoint = path.resolve(root, 'components/factories.ts');
  const sourceFile = program.getSourceFile(entrypoint);
  if (sourceFile === undefined) throw new Error('Component catalog entrypoint is missing from the compiler program.');
  const moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) throw new Error('Component catalog entrypoint has no module symbol.');
  return typeChecker.getExportsOfModule(moduleSymbol)
    .map((exported) => ({ name: exported.name, target: resolveAlias(exported, typeChecker) }))
    .filter(({ target }) => {
      const declaration = target.valueDeclaration ?? target.getDeclarations()?.[0];
      return declaration !== undefined
        && typeChecker.getTypeOfSymbolAtLocation(target, declaration).getCallSignatures().length > 0;
    });
}

function isTypeOnlyDependency(statement) {
  if (statement.isTypeOnly === true) return true;
  if (ts.isExportDeclaration(statement)) {
    return statement.exportClause !== undefined
      && ts.isNamedExports(statement.exportClause)
      && statement.exportClause.elements.length > 0
      && statement.exportClause.elements.every((element) => element.isTypeOnly);
  }
  if (!ts.isImportDeclaration(statement)) return false;
  const clause = statement.importClause;
  if (clause?.isTypeOnly === true) return true;
  if (clause?.name !== undefined || clause?.namedBindings === undefined
    || !ts.isNamedImports(clause.namedBindings)) return false;
  return clause.namedBindings.elements.length > 0
    && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function collectModuleDependencies(sourceFile, compilerOptions) {
  const dependencies = [];
  const seen = new Set();
  const record = (specifier, kind) => {
    const target = resolveSourceModule(specifier, sourceFile.fileName, compilerOptions);
    const key = `${kind}:${specifier}:${target ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    dependencies.push({ kind, specifier, target });
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, isTypeOnlyDependency(node) ? 'type' : 'runtime');
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression !== undefined
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      record(node.moduleReference.expression.text, node.isTypeOnly ? 'type' : 'runtime');
    } else if (ts.isImportTypeNode(node)
      && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteralLike(node.argument.literal)) {
      record(node.argument.literal.text, 'type');
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])) {
      record(node.arguments[0].text, 'dynamic');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return dependencies;
}

function resolveSourceModule(specifier, containingFile, compilerOptions) {
  const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys).resolvedModule;
  if (resolved === undefined) return undefined;
  const target = path.resolve(resolved.resolvedFileName);
  return knownSourceFiles.has(target) ? target : undefined;
}

function inspectExternalDependency(filePath, sourceLayer, dependency) {
  if (dependency.specifier.startsWith('.')) {
    failures.push(`${relative(filePath)} has unresolved local ${dependency.kind} dependency ${dependency.specifier}`);
    return;
  }
  if (dependency.kind === 'type') return;
  const allowed = externalRuntimeDependencies.get(sourceLayer);
  if (allowed?.has(dependency.specifier) !== true) {
    failures.push(
      `${relative(filePath)} imports external runtime authority ${dependency.specifier} from ${sourceLayer}`
    );
  }
}

function inspectDependencyAuthority(filePath, sourceLayer, dependency) {
  const targetLayer = architectureUnit(dependency.target);
  if (sourceLayer !== targetLayer) {
    const allowed = architectureDependencies.get(sourceLayer);
    if (allowed === undefined || !allowed.has(targetLayer)) {
      failures.push(
        `${relative(filePath)} imports forbidden ${targetLayer} ${dependency.kind} dependency through ${dependency.specifier}`
      );
      return;
    }
  }
  if (forbiddenPrivateDependency(filePath, sourceLayer, dependency.target)) {
    failures.push(
      `${relative(filePath)} imports package-private ${sourceRelative(dependency.target)} through ${dependency.specifier}`
    );
  }
}

function forbiddenPrivateDependency(sourceFile, sourceLayer, targetFile) {
  const sourcePath = sourceRelative(sourceFile);
  const targetPath = sourceRelative(targetFile);
  if (sourcePath.startsWith('renderer/model/') && targetPath.startsWith('renderer/internal/')) return true;
  if (sourceLayer === 'component' && targetPath.startsWith('renderer/')) {
    if (componentSharedRendererDependencies.has(targetPath)) return false;
    return sourcePath !== 'component/definition.ts'
      || !componentDefinitionPrivateRendererDependencies.has(targetPath);
  }
  if (sourceLayer === 'components'
    && (targetPath.startsWith('renderer/internal/') || targetPath.startsWith('renderer/model/'))) {
    return true;
  }
  return sourceLayer === 'layout' && targetPath.startsWith('renderer/internal/');
}

function inspectPublicBoundary(sourceFile, filePath, sourceEntrypoints) {
  if (!sourceEntrypoints.has(filePath)) return;
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteralLike(specifier) || !specifier.text.startsWith('.')) continue;
    const resolved = resolveSourceModule(specifier.text, filePath, compilerConfig.options);
    if (resolved === undefined) continue;
    const targetPath = sourceRelative(resolved);
    if (isPrivateModulePath(targetPath)
      && (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause))) {
      failures.push(`${relative(filePath)} must name every public symbol exported from package-private module ${targetPath}`);
    }
  }
}

function inspectPublicExportGraph(surface, entrypointFiles) {
  const { program, declarationFiles, declarationRoot } = surface;
  const declarationChecker = program.getTypeChecker();
  const entrypoints = program.getSourceFiles().filter((sourceFile) =>
    entrypointFiles.has(path.resolve(sourceFile.fileName)));
  const publiclyNamed = new Set();

  for (const entrypoint of entrypointFiles) {
    if (!declarationFiles.has(entrypoint)) {
      failures.push(`public declaration entrypoint was not emitted: ${path.relative(path.dirname(root), entrypoint)}`);
    }
  }
  for (const entrypoint of entrypoints) {
    const moduleSymbol = declarationChecker.getSymbolAtLocation(entrypoint);
    if (moduleSymbol === undefined) continue;
    for (const exported of declarationChecker.getExportsOfModule(moduleSymbol)) {
      publiclyNamed.add(resolveAlias(exported, declarationChecker));
    }
  }
  for (const entrypoint of entrypoints) {
    const moduleSymbol = declarationChecker.getSymbolAtLocation(entrypoint);
    if (moduleSymbol === undefined) continue;
    for (const exported of declarationChecker.getExportsOfModule(moduleSymbol)) {
      const target = resolveAlias(exported, declarationChecker);
      if ((target.flags & ts.SymbolFlags.Value) === 0) continue;
      const dependencies = [...privateDeclarationDependencies(
        target,
        declarationChecker,
        declarationFiles,
        declarationRoot,
        publiclyNamed
      )].sort();
      for (const dependency of dependencies) {
        failures.push(
          `${path.relative(path.dirname(root), entrypoint.fileName)} public export ${exported.name} exposes non-public declaration ${dependency}`
        );
      }
    }
  }
}

function privateDeclarationDependencies(
  rootSymbol,
  declarationChecker,
  declarationFiles,
  declarationRoot,
  publiclyNamed
) {
  const dependencies = new Set();
  const seenSymbols = new Set();
  const admittedCarriers = declaredCarrierSymbols(rootSymbol);

  visitSymbol(rootSymbol, true);
  return dependencies;

  function visitSymbol(symbol, root = false) {
    const target = resolveAlias(symbol, declarationChecker);
    if (seenSymbols.has(target)) return;
    seenSymbols.add(target);
    if (!root && publiclyNamed.has(target)) return;
    const declarations = (target.getDeclarations() ?? []).filter((declaration) =>
      declarationFiles.has(path.resolve(declaration.getSourceFile().fileName)));
    if (!root && !admittedCarriers.has(target)) {
      for (const declaration of declarations) recordPrivateDeclaration(target, declaration);
    }
    if ((target.flags & ts.SymbolFlags.Module) !== 0) {
      for (const exported of declarationChecker.getExportsOfModule(target)) visitSymbol(exported);
      return;
    }
    for (const declaration of declarations) visitDeclaration(declaration);
  }

  function visitDeclaration(node) {
    if (ts.isIdentifier(node) && !isNamespaceQualifier(node)) {
      const referenced = declarationChecker.getSymbolAtLocation(node);
      if (referenced !== undefined) visitSymbol(referenced);
    }
    ts.forEachChild(node, visitDeclaration);
  }

  function recordPrivateDeclaration(symbol, declaration) {
    if (!isTopLevelModuleDeclaration(declaration)) return;
    if (isUniqueSymbolDeclaration(declaration)) return;
    if ((symbol.flags & ts.SymbolFlags.Type) === 0) return;
    const declarationPath = path.relative(
      declarationRoot,
      path.resolve(declaration.getSourceFile().fileName)
    ).split(path.sep).join('/');
    dependencies.add(`${symbol.name} from dist/${declarationPath}`);
  }

  function declaredCarrierSymbols(symbol) {
    const carriers = new Set();
    for (const declaration of symbol.getDeclarations() ?? []) {
      if (!ts.isVariableDeclaration(declaration) || declaration.type === undefined) continue;
      let typeNode = declaration.type;
      while (ts.isParenthesizedTypeNode(typeNode)) typeNode = typeNode.type;
      if (!ts.isTypeReferenceNode(typeNode)) continue;
      const carrier = declarationChecker.getSymbolAtLocation(typeNode.typeName);
      if (carrier !== undefined) carriers.add(resolveAlias(carrier, declarationChecker));
    }
    return carriers;
  }
}

function isUniqueSymbolDeclaration(declaration) {
  return ts.isVariableDeclaration(declaration)
    && declaration.type !== undefined
    && ts.isTypeOperatorNode(declaration.type)
    && declaration.type.operator === ts.SyntaxKind.UniqueKeyword;
}

function isTopLevelModuleDeclaration(declaration) {
  if (ts.isVariableDeclaration(declaration)) {
    return ts.isVariableDeclarationList(declaration.parent)
      && ts.isVariableStatement(declaration.parent.parent)
      && ts.isSourceFile(declaration.parent.parent.parent);
  }
  return ts.isSourceFile(declaration.parent);
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
  const configPath = path.resolve(projectRoot, 'tsconfig.json');
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

async function loadPublicEntrypoints(knownFiles) {
  const manifestPath = path.resolve(projectRoot, 'package.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const declarations = new Set();
  const sources = new Set();
  for (const [exportName, configuration] of Object.entries(manifest.exports ?? {})) {
    const declarationPath = configuration?.types;
    const runtimePath = configuration?.default;
    if (typeof declarationPath !== 'string' || declarationPath.includes('*')) continue;
    if (!declarationPath.startsWith('./dist/') || !declarationPath.endsWith('.d.ts')) {
      throw new Error(`Unsupported public declaration entrypoint ${declarationPath}.`);
    }
    if (typeof runtimePath !== 'string'
      || !runtimePath.startsWith('./dist/')
      || !runtimePath.endsWith('.js')
      || runtimePath.includes('*')) {
      throw new Error(`Unsupported public runtime entrypoint ${String(runtimePath)} for ${exportName}.`);
    }
    const declaration = path.resolve(path.dirname(manifestPath), declarationPath);
    const source = path.resolve(
      root,
      runtimePath.slice('./dist/'.length).replace(/\.js$/u, '.ts')
    );
    if (!knownFiles.has(source)) {
      throw new Error(`Public export ${exportName} has no source entrypoint ${relative(source)}.`);
    }
    declarations.add(declaration);
    sources.add(source);
  }
  return { declarations, sources };
}

function architectureProjectRoot(arguments_) {
  if (arguments_.length === 0) return path.resolve(import.meta.dirname, '..');
  if (arguments_.length === 2 && arguments_[0] === '--project-root') {
    return path.resolve(arguments_[1]);
  }
  throw new Error('Usage: node scripts/check-architecture.mjs [--project-root <path>]');
}

function architectureUnit(filePath) {
  const relativePath = path.relative(root, filePath);
  return relativePath.startsWith('..') ? undefined : relativePath.split(path.sep)[0];
}

function reportRuntimeCycles(graph) {
  const reported = new Set();
  for (const component of stronglyConnectedComponents(graph)) {
    if (component.length <= 1) continue;
    const units = [...new Set(component.map(architectureUnit))];
    const modelOnly = units.length === 1
      && units[0] === 'renderer'
      && component.every((filePath) => sourceRelative(filePath).startsWith('renderer/model/'));
    if (modelOnly) continue;
    const key = cycleKey(component);
    reported.add(key);
    failures.push(`runtime dependency cycle: ${component.map(relative).sort().join(', ')}`);
  }
  return reported;
}

function reportArchitecturalCycles(graph, runtimeCycles) {
  for (const component of stronglyConnectedComponents(graph)) {
    if (component.length <= 1) continue;
    const units = new Set(component.map(architectureUnit));
    const key = cycleKey(component);
    if (units.size <= 1 || runtimeCycles.has(key)) continue;
    failures.push(`type dependency cycle crosses architecture boundaries: ${component.map(relative).sort().join(', ')}`);
  }
}

function cycleKey(component) {
  return component.map((filePath) => path.resolve(filePath)).sort().join('\0');
}

function isPrivateModulePath(filePath) {
  return filePath.startsWith('internal/')
    || filePath.startsWith('model/')
    || filePath.includes('/internal/')
    || filePath.includes('/model/');
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
