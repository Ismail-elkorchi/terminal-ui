import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatTypeDiagnostic, typecheckSource } from './support/typecheck.mjs';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

const entrypoints = [
  '.',
  './host',
  './input',
  './protocol',
  './text',
  './theme',
  './prompts',
  './tui',
  './components',
  './layout',
  './behavior',
  './renderer',
  './accessibility',
  './transcript',
  './testing',
  './schemas'
];

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
  assert.equal(terminalUi.terminalUiPackage.schemaVersion, 'terminal-ui.v1');
  assert.deepEqual(terminalUi.terminalUiPackage.runtimeTargets, ['node', 'deno', 'bun', 'memory']);
  assert.ok(terminalUi.terminalUiPackage.entrypoints.includes('components'));
  assert.ok(terminalUi.terminalUiPackage.entrypoints.includes('layout'));
  assert.ok(terminalUi.terminalUiPackage.entrypoints.includes('behavior'));
  assert.ok(terminalUi.terminalUiPackage.entrypoints.includes('renderer'));
  assert.ok(terminalUi.terminalDiagnosticCodes.includes('INPUT_CANCELLED'));
  assert.ok(terminalUi.accessibleRoles.includes('application'));
  assert.ok(terminalUi.accessibleSources.includes('tui'));
  assert.equal(typeof terminalUi.createDenoTerminalHost, 'function');
  assert.equal(typeof terminalUi.createBunTerminalHost, 'function');
  assert.equal(typeof terminalUi.createMemoryTerminalHost, 'function');
  assert.equal(typeof terminalUi.createPtyTerminalHost, 'function');
  assert.equal(typeof terminalUi.runPrompt, 'function');
  assert.equal(typeof terminalUi.createProgress, 'function');
  assert.equal(typeof terminalUi.confirm, 'function');
  assert.equal(typeof terminalUi.input, 'function');
  assert.equal(typeof terminalUi.password, 'function');
  assert.equal(typeof terminalUi.select, 'function');
  assert.equal(typeof terminalUi.defineTui, 'function');
  assert.equal(typeof terminalUi.createTuiRuntime, 'function');
  assert.equal(typeof terminalUi.intervalSource, 'function');
  assert.equal(typeof terminalUi.timeoutSource, 'function');
  assert.equal(typeof terminalUi.animationSource, 'function');
  assert.equal(typeof terminalUi.contrastColor, 'function');
  assert.equal(typeof terminalUi.ensureContrast, 'function');
  assert.equal(typeof terminalUi.deriveSurface, 'function');
  assert.equal(typeof terminalUi.themePacks, 'object');
  assert.equal(typeof terminalUi.components.notificationStack, 'function');
  assert.equal(typeof terminalUi.components.gauge, 'function');
  assert.equal(typeof terminalUi.components.heatmap, 'function');
  assert.equal(typeof terminalUi.components.toggleSwitch, 'function');
  assert.equal(typeof terminalUi.components.slider, 'function');
  assert.equal(typeof terminalUi.components.rangeSlider, 'function');
  assert.equal(typeof terminalUi.components.checkboxList, 'function');
  assert.equal(typeof terminalUi.components.colorPicker, 'function');
  assert.equal(typeof terminalUi.components.datePicker, 'function');
  assert.equal(typeof terminalUi.components.normalizeProcessStatus, 'function');
  assert.equal(typeof terminalUi.components.optionalRecordStatus, 'function');
  assert.equal(typeof terminalUi.components.normalizeNotificationTone, 'function');
  assert.equal(typeof terminalUi.components.recordStatusFromTone, 'function');

  assert.equal(typeof terminalUi.layout.grid, 'function');
  assert.equal(typeof terminalUi.layout.responsive, 'function');
  assert.equal('splitTracks' in terminalUi.layout, false);
  assert.equal(typeof terminalUi.behavior.commandBarReducer, 'function');
  assert.equal(typeof terminalUi.behavior.paletteReducer, 'function');
  assert.equal(typeof terminalUi.behavior.screenStackReducer, 'function');
  assert.equal(typeof terminalUi.renderer.renderElementFrame, 'function');
  assert.equal(typeof terminalUi.renderer.renderFramePlain, 'function');
  assert.equal(typeof terminalUi.renderer.drawAreaSeries, 'function');
  assert.equal(typeof terminalUi.renderer.splitTracks, 'function');
  assert.equal(typeof terminalUi.createPtyTerminalHarness, 'function');
  assert.equal(typeof terminalUi.createTerminalHarness, 'function');
  assert.equal(typeof terminalUi.createVisualSnapshot, 'function');
  assert.equal(typeof terminalUi.runInteractionScript, 'function');
  assert.equal(typeof terminalUi.assertVisibleText, 'function');
  assert.equal(typeof terminalUi.assertSelected, 'function');
  assert.equal(typeof terminalUi.assertHitTarget, 'function');
  assert.equal(typeof terminalUi.findAccessibleNode, 'function');
  assert.equal(typeof terminalUi.validateAccessibleSnapshot, 'function');
  assert.equal(typeof terminalUi.validateTranscript, 'function');

  assert.equal('commandBarReducer' in terminalUi, false);
  assert.equal('renderElementFrame' in terminalUi, false);
  assert.equal('layoutElement' in terminalUi, false);
  assert.equal('tableReducer' in terminalUi.components, false);
  assert.equal('grid' in terminalUi.components, false);
  assert.equal('custom' in terminalUi.components, false);
  assert.equal('renderElementFrame' in terminalUi.tui, false);
  assert.equal('layoutElement' in terminalUi.tui, false);
});

test('transcript entrypoint exposes replay against a structural harness target', async () => {
  const { replayTranscript } = await import('@ismail-elkorchi/terminal-ui/transcript');
  const { createTerminalHarness } = await import('@ismail-elkorchi/terminal-ui/testing');
  const harness = createTerminalHarness();

  const result = await replayTranscript(harness, {
    schemaVersion: 'terminal-ui.interaction-transcript.v1',
    id: 'entrypoint-replay',
    source: 'test',
    steps: [{ kind: 'input', event: { kind: 'text', text: 'x', paste: false } }],
    diagnostics: [],
    redactions: []
  });

  assert.equal(typeof replayTranscript, 'function');
  assert.equal(result.transcript.steps[0]?.kind, 'input');
});

test('testing harness declaration exposes captured output', async () => {
  const declaration = await readFile(new URL('../../dist/testing/types.d.ts', import.meta.url), 'utf8');

  assert.match(declaration, /output\(\): string;/u);
  assert.match(declaration, /readonly clock: ControlledTerminalClock;/u);
  assert.match(declaration, /interface PtyTerminalHarness/u);
  assert.match(declaration, /closeInput\(\): void;/u);
});

test('root declaration exposes primary public type contracts', async () => {
  const declaration = await readFile(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');
  const componentsDeclaration = await readFile(new URL('../../dist/components/index.d.ts', import.meta.url), 'utf8');
  const componentContractsDeclaration = await readFile(new URL('../../dist/components/contracts.d.ts', import.meta.url), 'utf8');
  const componentElementDeclaration = await readFile(new URL('../../dist/components/element.d.ts', import.meta.url), 'utf8');
  const componentTypesDeclaration = await readFile(new URL('../../dist/components/types.d.ts', import.meta.url), 'utf8');
  const layoutDeclaration = await readFile(new URL('../../dist/layout/index.d.ts', import.meta.url), 'utf8');
  const behaviorDeclaration = await readFile(new URL('../../dist/behavior/index.d.ts', import.meta.url), 'utf8');
  const rendererDeclaration = await readFile(new URL('../../dist/renderer/index.d.ts', import.meta.url), 'utf8');
  const tuiDeclaration = await readFile(new URL('../../dist/tui/index.d.ts', import.meta.url), 'utf8');
  const tuiTypesDeclaration = await readFile(new URL('../../dist/tui/types.d.ts', import.meta.url), 'utf8');
  const renderNodeRendererDeclaration = await readFile(new URL('../../dist/tui/render-node-renderer.d.ts', import.meta.url), 'utf8');
  const borderDeclaration = await readFile(new URL('../../dist/tui/border.d.ts', import.meta.url), 'utf8');

  for (const typeName of [
    'InputEvent',
    'KeyEvent',
    'TextEditBuffer',
    'TerminalTheme',
    'TerminalDesignTokens',
    'TuiDefinition',
    'Element',
    'ButtonOptions',
    'CommandBarOptions',
    'GridOptions',
    'VisualSnapshotInput'
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
    'ActionItem',
    'ChoiceItem',
    'ComponentStatus',
    'ComponentTone'
  ]) {
    assert.match(componentContractsDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `components:${typeName}`);
  }
  for (const typeName of [
    'ComponentMeta',
    'ComponentOptions',
    'ButtonOptions',
    'CommandBarAction',
    'CommandBarOptions',
    'MenuItem',
    'PaletteAction',
    'TableColumn',
    'TreeNode'
  ]) {
    assert.match(componentTypesDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `components:${typeName}`);
  }
  assert.doesNotMatch(componentTypesDeclaration, /\bTableAction\b/u);
  assert.doesNotMatch(componentTypesDeclaration, /\bFrameBuffer\b/u);
  for (const authoredDeclaration of [
    declaration,
    componentsDeclaration,
    componentContractsDeclaration,
    componentTypesDeclaration,
    layoutDeclaration,
    behaviorDeclaration
  ]) {
    assert.doesNotMatch(
      authoredDeclaration,
      /\b(?:[A-Za-z][A-Za-z0-9]*WidgetOptions|Widget(?:Tone|Status|Item|Role|State|Scope|Event|Renderer))\b/u
    );
  }

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
  assert.doesNotMatch(layoutDeclaration, /\bScreenStack\b/u);
  assert.doesNotMatch(layoutDeclaration, /\b(?:Layer|LayoutNode|Rect|RegionOpacity)\b/u);
  assert.doesNotMatch(layoutDeclaration, /\b(?:gridCellRects|splitTracks)\b/u);

  for (const typeName of [
    'CommandBarAction',
    'CommandBarState',
    'NotificationAction',
    'PaletteAction',
    'ScreenStack',
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
    'RenderNodeRenderer',
    'RenderNode'
  ]) {
    assert.match(rendererDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `renderer:${typeName}`);
  }
  assert.doesNotMatch(rendererDeclaration, /\bscrollbackWindow\b/u);

  for (const typeName of [
    'TuiContext',
    'TuiInit',
    'TuiKeyBinding',
    'TuiRuntime',
    'TuiUpdateResult'
  ]) {
    assert.match(tuiTypesDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `tui:${typeName}`);
  }
  assert.doesNotMatch(tuiDeclaration, /\bFrameBuffer\b/u);
  assert.doesNotMatch(tuiDeclaration, /\bWidgetRenderer\b/u);

  assert.doesNotMatch(componentElementDeclaration, /\bRenderNode\b/u);
  assert.doesNotMatch(componentElementDeclaration, /\b(?:elementFromRenderNode|toRenderNode|toRenderNodes)\b/u);
  assert.doesNotMatch(componentElementDeclaration, /readonly \[key: string\]: unknown;/u);

  assert.match(renderNodeRendererDeclaration, /export interface FocusTarget \{/u);
  assert.match(renderNodeRendererDeclaration, /readonly id: string;/u);
  assert.doesNotMatch(renderNodeRendererDeclaration, /readonly id\?: string;/u);
  assert.match(renderNodeRendererDeclaration, /readonly scopeId\?: string;/u);
  assert.match(renderNodeRendererDeclaration, /readonly focused: boolean;/u);
  assert.match(borderDeclaration, /readonly titleAlign\?: 'start' \| 'center' \| 'end';/u);
  assert.match(borderDeclaration, /readonly focusStyle\?: TerminalStyle;/u);
});

test('public renderer helpers accept authored component elements', () => {
  assertNoTypeDiagnostics(`
    import { text } from '@ismail-elkorchi/terminal-ui/components';
    import { stack } from '@ismail-elkorchi/terminal-ui/layout';
    import { layoutElement, renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    const element = stack([text('x', { id: 'x' })], { id: 'root' });
    const frame = renderElementFrame(element, { columns: 10, rows: 3 });
    const layout = layoutElement(element, { columns: 10, rows: 3 });

    void frame;
    void layout;
  `);
});

test('public authored Element rejects arbitrary objects', () => {
  assertNoTypeDiagnostics(`
    import type { Element } from '@ismail-elkorchi/terminal-ui/components';
    import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    // @ts-expect-error plain objects are not authored terminal-ui elements
    const invalidElement: Element = {};

    // @ts-expect-error renderer helpers require authored terminal-ui elements
    renderElementFrame({}, { columns: 10, rows: 3 });

    void invalidElement;
  `);
});

test('renderer and layout boundaries reject unauthored JavaScript objects', async () => {
  const { text } = await import('@ismail-elkorchi/terminal-ui/components');
  const { stack } = await import('@ismail-elkorchi/terminal-ui/layout');
  const { renderElementFrame, renderFramePlain } = await import('@ismail-elkorchi/terminal-ui/renderer');
  const invalid = { kind: 'text', props: { content: 'not authored' } };
  const element = text('authored');

  assert.equal(Object.isFrozen(element), true);
  assert.deepEqual(Reflect.ownKeys(element), []);
  assert.equal('kind' in element, false);
  assert.equal('props' in element, false);
  assert.equal(renderFramePlain(renderElementFrame(element, { columns: 10, rows: 3 })), 'authored');

  assert.throws(
    () => renderElementFrame(invalid, { columns: 10, rows: 3 }),
    /Expected an Element created by a terminal-ui component or layout factory/u
  );
  assert.throws(
    () => stack([invalid]),
    /Expected an Element created by a terminal-ui component or layout factory/u
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
