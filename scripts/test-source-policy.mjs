import ts from 'typescript';

const nodeTestFunctions = new Set(['default', 'describe', 'it', 'suite', 'test']);
const disabledModifiers = new Set(['only', 'skip', 'todo']);

export function findDisabledNodeTests(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  const bindings = nodeTestBindings(sourceFile);
  const violations = [];

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = resolveTestCallee(node.expression, bindings);
      if (callee !== undefined) {
        if (callee.modifier !== undefined) {
          violations.push(violation(sourceFile, node, callee.modifier));
        }
        for (const argument of node.arguments) {
          if (!ts.isObjectLiteralExpression(argument)) continue;
          for (const property of argument.properties) {
            const name = propertyName(property.name);
            if (name === undefined || !disabledModifiers.has(name)) continue;
            if (ts.isPropertyAssignment(property) && property.initializer.kind === ts.SyntaxKind.FalseKeyword) continue;
            violations.push(violation(sourceFile, property, name));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function nodeTestBindings(sourceFile) {
  const functions = new Set();
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== 'node:test') continue;
    const clause = statement.importClause;
    if (clause?.name !== undefined) functions.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (nodeTestFunctions.has(imported)) functions.add(element.name.text);
    }
  }
  return { functions, namespaces };
}

function resolveTestCallee(expression, bindings) {
  if (ts.isIdentifier(expression) && bindings.functions.has(expression.text)) return {};
  if (!ts.isPropertyAccessExpression(expression)) return undefined;
  if (ts.isIdentifier(expression.expression)
    && bindings.namespaces.has(expression.expression.text)
    && nodeTestFunctions.has(expression.name.text)) return {};
  const base = resolveTestCallee(expression.expression, bindings);
  if (base === undefined || !disabledModifiers.has(expression.name.text)) return undefined;
  return { modifier: expression.name.text };
}

function propertyName(name) {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return undefined;
}

function violation(sourceFile, node, kind) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { kind, line: position.line + 1, column: position.character + 1 };
}
