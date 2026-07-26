import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatTypeDiagnostic, typecheckSource } from './support/typecheck.mjs';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

const entrypoints = Object.keys(packageJson.exports)
  .filter((entrypoint) => !entrypoint.includes('*'));

test('all public entrypoints import from built package', async () => {
  for (const entrypoint of entrypoints) {
    const module = await import(`@ismail-elkorchi/terminal-ui${entrypoint === '.' ? '' : entrypoint.slice(1)}`);
    assert.equal(typeof module, 'object', entrypoint);
  }
});

test('all declared public value exports exist at runtime', async () => {
  for (const entrypoint of entrypoints) {
    const exportConfig = packageJson.exports[entrypoint];
    assert.equal(typeof exportConfig.types, 'string', entrypoint);
    const declaration = await readFile(new URL(`../../${exportConfig.types}`, import.meta.url), 'utf8');
    const module = await import(`@ismail-elkorchi/terminal-ui${entrypoint === '.' ? '' : entrypoint.slice(1)}`);
    for (const exportName of declaredValueExports(declaration)) {
      assert.ok(exportName in module, `${entrypoint} missing runtime export ${exportName}`);
    }
  }
});

test('root exposes the primary vertical path', async () => {
  const terminalUi = await import('@ismail-elkorchi/terminal-ui');
  assert.ok(terminalUi.terminalDiagnosticCodes.includes('INPUT_CANCELLED'));
  assert.equal(typeof terminalUi.createTerminalHost, 'function');
  assert.equal(typeof terminalUi.defineTui, 'function');
  assert.equal(typeof terminalUi.runTui, 'function');
  for (const advancedExport of ['button', 'grid', 'renderElementFrame', 'tableReducer', 'createTerminalHarness', 'confirm']) {
    assert.equal(advancedExport in terminalUi, false, advancedExport);
  }
});

test('transcript entrypoint exposes replay against a structural harness target', async () => {
  const { replayTranscript } = await import('@ismail-elkorchi/terminal-ui/transcript');
  const { createTerminalHarness } = await import('@ismail-elkorchi/terminal-ui/testing');
  const harness = createTerminalHarness();

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v4',
    id: 'entrypoint-replay',
    source: 'test',
    steps: [{ kind: 'input', event: { kind: 'text', text: 'x', paste: false } }],
    diagnostics: [],
    redactions: []
  });

  assert.equal(typeof replayTranscript, 'function');
  assert.equal(result.transcript.steps[0]?.kind, 'input');
});

test('testing harness exposes captured output, clocks, and PTY input closure', () => {
  assertNoTypeDiagnostics(`
    import {
      createTerminalHarness,
      type ControlledTerminalClock,
      type PtyTerminalHarness
    } from '@ismail-elkorchi/terminal-ui/testing';

    const harness = createTerminalHarness();
    const output: string = harness.output();
    const clock: ControlledTerminalClock = harness.clock;
    declare const pty: PtyTerminalHarness;
    pty.closeInput();

    void output;
    void clock;
  `);
});

test('entrypoint declarations expose layered public type contracts', async () => {
  const declaration = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');
  const componentContractsDeclaration = await readFile(new URL('../../dist/ui-model/contracts.d.ts', import.meta.url), 'utf8');
  const componentElementDeclaration = await readFile(new URL('../../dist/element/types.d.ts', import.meta.url), 'utf8');
  const componentOptionDeclarations = (await Promise.all([
    'base',
    'content',
    'documents',
    'drawing',
    'feedback',
    'forms',
    'menus'
  ].map((name) => name === 'base'
    ? readFile(new URL('../../dist/element/metadata.d.ts', import.meta.url), 'utf8')
    : readFile(new URL(`../../dist/components/options/${name}.d.ts`, import.meta.url), 'utf8')))).join('\n');
  const layoutDeclaration = await readFile(new URL('../../dist/layout/index.d.ts', import.meta.url), 'utf8');
  const behaviorDeclaration = await readFile(new URL('../../dist/behavior/index.d.ts', import.meta.url), 'utf8');
  const rendererDeclaration = await readFile(new URL('../../dist/renderer/index.d.ts', import.meta.url), 'utf8');
  const tuiDeclaration = await readFile(new URL('../../dist/tui/index.d.ts', import.meta.url), 'utf8');
  const tuiTypesDeclaration = await readFile(new URL('../../dist/tui/types.d.ts', import.meta.url), 'utf8');

  for (const typeName of [
    'TuiDefinition',
    'TuiUpdateResult',
    'TerminalHost',
    'Result'
  ]) {
    assert.match(declaration, new RegExp(`\\b${typeName}\\b`, 'u'), typeName);
  }

  for (const typeName of [
    'Element',
    'ElementChildren'
  ]) {
    assert.match(componentElementDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `components:${typeName}`);
  }
  for (const typeName of [
    'ChoiceItem',
    'StatusBarStatus',
    'ProcessStatus',
    'RecordResult',
    'LogLevel',
    'ValidationLevel'
  ]) {
    assert.match(componentContractsDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `components:${typeName}`);
  }
  for (const typeName of [
    'ElementMeta',
    'ElementOptions',
    'ButtonOptions',
    'CommandInputAction',
    'CommandInputOptions',
    'LogEntry',
    'LogHistory',
    'LogViewerAction',
    'LogViewerOptions',
    'MenuItem',
    'SearchPickerAction',
    'SearchPickerOptions',
    'TableAction',
    'TableColumn',
    'TreeNode'
  ]) {
    assert.match(componentOptionDeclarations, new RegExp(`\\b${typeName}\\b`, 'u'), `components:${typeName}`);
  }
  assert.doesNotMatch(componentOptionDeclarations, /\bFrameBuffer\b/u);

  for (const typeName of [
    'LayoutSize',
    'LayoutFlowOptions',
    'GridLayoutOptions',
    'GridOptions',
    'ResponsiveBreakpointMap',
    'ViewportDimensions'
  ]) {
    assert.match(layoutDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `layout:${typeName}`);
  }
  assert.doesNotMatch(layoutDeclaration, /\bNavigationStack\b/u);
  assert.doesNotMatch(layoutDeclaration, /\b(?:Layer|LayoutNode|Rect)\b/u);
  assert.doesNotMatch(layoutDeclaration, /\b(?:gridCellRects|splitTracks)\b/u);

  for (const typeName of [
    'CommandInputAction',
    'CommandInputState',
    'LogHistory',
    'LogViewerAction',
    'NavigationEntry',
    'NavigationStack',
    'NavigationStackAction',
    'NotificationAction',
    'SearchPickerAction',
    'ScrollAction',
    'SpinnerAction',
    'TableAction',
    'TreeAction'
  ]) {
    assert.match(behaviorDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `behavior:${typeName}`);
  }

  for (const typeName of [
    'Frame',
    'FrameBuffer',
    'FrameCellSource',
    'Measurement',
    'LayoutNode',
    'Rect',
    'RenderDiff',
    'RenderSpan',
    'CustomRenderer'
  ]) {
    assert.match(rendererDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `renderer:${typeName}`);
  }
  for (const typeName of [
    'TuiContext',
    'TuiInit',
    'TuiInputBinding',
    'TuiRuntime',
    'TuiUpdateResult'
  ]) {
    assert.match(tuiTypesDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `tui:${typeName}`);
  }
  assert.doesNotMatch(tuiDeclaration, /\bFrameBuffer\b/u);

  assert.doesNotMatch(componentElementDeclaration, /\bRenderNode\b/u);
  assert.doesNotMatch(componentElementDeclaration, /\b(?:elementFromRenderNode|toRenderNode|toRenderNodes)\b/u);
  assert.doesNotMatch(componentElementDeclaration, /readonly \[key: string\]: unknown;/u);

});

test('renderer focus targets and authored border titles expose usable structural contracts', () => {
  assertNoTypeDiagnostics(`
    import { text } from '@ismail-elkorchi/terminal-ui/components';
    import { surface } from '@ismail-elkorchi/terminal-ui/layout';
    import type {
      FocusTarget,
      RenderFocusRelation
    } from '@ismail-elkorchi/terminal-ui/renderer';

    const relation: RenderFocusRelation = 'descendant';
    const target: FocusTarget = {
      id: 'field',
      bounds: { row: 0, column: 0, width: 8, height: 1 },
      disabled: false,
      order: 1,
      scopeId: 'form'
    };
    const element = surface(text('Title'), {
      title: { start: 'Start', center: 'Center', end: 'End' },
      border: { kind: 'single', titleAlign: 'center' }
    });

    void target;
    void element;
  `);
});

test('public renderer helpers accept authored component elements', () => {
  assertNoTypeDiagnostics(`
    import { dialog, tabs, text } from '@ismail-elkorchi/terminal-ui/components';
    import { column } from '@ismail-elkorchi/terminal-ui/layout';
    import { layoutElement, renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    const panels = tabs({
      id: 'tabs',
      tabs: [{ id: 'main', label: 'Main', panel: text('x', { id: 'x' }) }]
    });
    const element = column([
      dialog(panels, {
        id: 'dialog',
        title: 'Example',
        modal: true,
        focusPolicy: { returnFocus: 'restore' }
      })
    ], { id: 'root' });
    const frame = renderElementFrame(element, { columns: 10, rows: 3 });
    const layout = layoutElement(element, { columns: 10, rows: 3 });

    void frame;
    void layout;
  `);
});

test('public Element contracts reject arbitrary objects', () => {
  assertNoTypeDiagnostics(`
    import type { Element } from '@ismail-elkorchi/terminal-ui/components';
    import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    // @ts-expect-error plain objects are not terminal-ui elements
    const invalidElement: Element = {};

    // @ts-expect-error renderer helpers require terminal-ui elements
    renderElementFrame({}, { columns: 10, rows: 3 });

    void invalidElement;
  `);
});

test('renderer and layout boundaries reject objects not created by element factories', async () => {
  const { text } = await import('@ismail-elkorchi/terminal-ui/components');
  const { column } = await import('@ismail-elkorchi/terminal-ui/layout');
  const { renderElementFrame, renderFramePlain } = await import('@ismail-elkorchi/terminal-ui/renderer');
  const invalid = { kind: 'text', props: { content: 'plain object' } };
  const element = text('valid element');

  assert.equal(Object.isFrozen(element), true);
  assert.deepEqual(Reflect.ownKeys(element), []);
  assert.equal('kind' in element, false);
  assert.equal('props' in element, false);
  assert.equal(renderFramePlain(renderElementFrame(element, { columns: 20, rows: 3 })), 'valid element');

  assert.throws(
    () => renderElementFrame(invalid, { columns: 10, rows: 3 }),
    /Expected an Element created by a terminal-ui component, layout, or renderer-extension factory/u
  );
  assert.throws(
    () => column([invalid]),
    /Expected an Element created by a terminal-ui component, layout, or renderer-extension factory/u
  );
});

function declaredValueExports(declaration) {
  const names = new Set();
  for (const match of declaration.matchAll(/export\s+\{(?<names>[^}]+)\}/gu)) {
    for (const name of exportedNames(match.groups?.names ?? '')) {
      names.add(name);
    }
  }
  for (const match of declaration.matchAll(/export\s+\*\s+as\s+(?<name>[A-Za-z_$][\w$]*)\s+from/gu)) {
    if (match.groups?.name !== undefined) names.add(match.groups.name);
  }
  for (const match of declaration.matchAll(/export\s+declare\s+(?:const|function|class)\s+(?<name>[A-Za-z_$][\w$]*)/gu)) {
    if (match.groups?.name !== undefined) names.add(match.groups.name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function assertNoTypeDiagnostics(source) {
  const diagnostics = typecheckSource(source);
  assert.deepEqual(
    diagnostics.map((diagnostic) => formatTypeDiagnostic(diagnostic)),
    []
  );
}

function exportedNames(source) {
  return source
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .filter((name) => !name.startsWith('type '))
    .map((name) => name.replace(/^type\s+/u, ''))
    .map((name) => {
      const alias = /\s+as\s+(?<alias>[A-Za-z_$][\w$]*)$/u.exec(name);
      return alias?.groups?.alias ?? name;
    });
}
