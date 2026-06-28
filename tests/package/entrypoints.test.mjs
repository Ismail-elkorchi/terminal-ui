import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

const entrypoints = [
  '.',
  './host',
  './input',
  './protocol',
  './text',
  './theme',
  './prompts',
  './shell',
  './tui',
  './widgets',
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
  assert.equal(typeof terminalUi.createShell, 'function');
  assert.equal(typeof terminalUi.createCliCoreCommandSource, 'function');
  assert.equal(typeof terminalUi.createCommandPalette, 'function');
  assert.equal(typeof terminalUi.defineTui, 'function');
  assert.equal(typeof terminalUi.createTuiRuntime, 'function');
  assert.equal(typeof terminalUi.commandBarReducer, 'function');
  assert.equal(typeof terminalUi.paletteWindow, 'function');
  assert.equal(typeof terminalUi.filterPaletteEntries, 'function');
  assert.equal(typeof terminalUi.screenStackReducer, 'function');
  assert.equal(typeof terminalUi.activeScreen, 'function');
  assert.equal(typeof terminalUi.splitTracks, 'function');
  assert.equal(typeof terminalUi.gridCellRects, 'function');
  assert.equal(typeof terminalUi.layoutWidget, 'function');
  assert.equal(typeof terminalUi.renderWidgetFrame, 'function');
  assert.equal(typeof terminalUi.renderWidgetLayers, 'function');
  assert.equal(typeof terminalUi.scrollbarLayout, 'function');
  assert.equal(typeof terminalUi.renderScrollbars, 'function');
  assert.equal(typeof terminalUi.spinnerReducer, 'function');
  assert.equal(typeof terminalUi.nextSpinnerFrameIndex, 'function');
  assert.equal(typeof terminalUi.normalizeSpinnerFrameIndex, 'function');
  assert.equal(typeof terminalUi.drawBorder, 'function');
  assert.equal(typeof terminalUi.clipRenderSpans, 'function');
  assert.equal(typeof terminalUi.diffFrames, 'function');
  assert.equal(typeof terminalUi.renderDiffAnsi, 'function');
  assert.equal(typeof terminalUi.renderFrameAnsi, 'function');
  assert.equal(typeof terminalUi.renderFrameDebug, 'function');
  assert.equal(typeof terminalUi.renderFramePlain, 'function');
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
  const rendererDeclaration = await readFile(new URL('../../dist/tui/widget-renderer.d.ts', import.meta.url), 'utf8');
  const borderDeclaration = await readFile(new URL('../../dist/tui/border.d.ts', import.meta.url), 'utf8');
  const publicTypes = [
    'InputEvent',
    'KeyEvent',
    'TextEditBuffer',
    'TextEditOperation',
    'TextAreaEditBuffer',
    'TextAreaEditOperation',
    'ExtractTextSelectionInput',
    'TuiNonTtyPolicy',
    'PaginationWindow',
    'TreeAction',
    'SpinnerAction',
    'SpinnerReducerOptions',
    'SpinnerState',
    'TableColumn',
    'TerminalTheme',
    'ThemeToken',
    'ThemeColor',
    'TerminalSymbols',
    'BorderGlyphSet',
    'BorderStyle',
    'Layer',
    'LayoutAlignment',
    'LayoutSize',
    'LayoutJustification',
    'LayoutOverflow',
    'LayoutFlowOptions',
    'GridLayoutOptions',
    'Widget',
    'WidgetKind',
    'WidgetStyleSlots',
    'WidgetVisualState',
    'CommandBarWidgetOptions',
    'CommandBarValidation',
    'CommandBarValidationTone',
    'CommandPaletteWidgetOptions',
    'PaletteEntry',
    'PaletteWidgetOptions',
    'FormWidgetOptions',
    'FieldWidgetOptions',
    'LabelWidgetOptions',
    'ButtonWidgetOptions',
    'CheckboxWidgetOptions',
    'FormOption',
    'RadioGroupWidgetOptions',
    'SelectBoxWidgetOptions',
    'TextInputWidgetOptions',
    'NumberInputWidgetOptions',
    'MenuItem',
    'MenuWidgetOptions',
    'MenuBarWidgetOptions',
    'ContextMenuWidgetOptions',
    'DropdownWidgetOptions',
    'CanvasPainter',
    'CanvasPainterInput',
    'CanvasWidgetOptions',
    'SurfaceWidgetOptions',
    'AbsoluteWidgetOptions',
    'OverlayWidgetOptions',
    'RichTextWidgetOptions',
    'GridWidgetOptions',
    'SplitPaneWidgetOptions',
    'TabsWidgetOptions',
    'ModalWidgetOptions',
    'TableCellRenderInput',
    'TableColumnAlignment',
    'TableColumnWidth',
    'TableSortDirection',
    'CustomWidgetOptions',
    'WidgetLayerOptions',
    'WidgetFocusOptions',
    'WidgetFocusScope',
    'WidgetRenderer',
    'WidgetRenderInput',
    'WidgetAccessibilityInput',
    'FocusTarget',
    'HitTarget',
    'FrameHitTarget',
    'TextAreaWidgetOptions',
    'TreeWidgetOptions',
    'PaginatorWidgetOptions',
    'ProgressBarLabelPosition',
    'ProgressBarMode',
    'HelpBarWidgetOptions',
    'ActivityIndicatorWidgetOptions',
    'SparklineWidgetOptions',
    'BarChartWidgetOptions',
    'ChartWidgetOptions',
    'ScreenStack',
    'PromptChoice',
    'NonTtyPromptPolicy',
    'ShellArgvParser',
    'ShellEvent',
    'ShellState',
    'ShellTranscript',
    'TuiContext',
    'TuiInit',
    'TuiUpdateResult',
    'AccessibilityOptions',
    'AccessibleValue',
    'InteractionResult',
    'TranscriptReplayTarget',
    'InteractionScript',
    'VisibleTextAssertion',
    'SelectedAssertion',
    'HitTargetAssertion',
    'VisualSnapshotArtifacts',
    'VisualSnapshotInput'
  ];

  for (const typeName of publicTypes) {
    assert.match(declaration, new RegExp(`\\b${typeName}\\b`, 'u'), typeName);
  }
  assert.match(rendererDeclaration, /export interface FocusTarget \{/u);
  assert.match(rendererDeclaration, /readonly id: string;/u);
  assert.doesNotMatch(rendererDeclaration, /readonly id\?: string;/u);
  assert.match(rendererDeclaration, /readonly scopeId\?: string;/u);
  assert.match(rendererDeclaration, /readonly focused: boolean;/u);
  assert.match(borderDeclaration, /readonly titleAlign\?: 'start' \| 'center' \| 'end';/u);
  assert.match(borderDeclaration, /readonly focusStyle\?: TerminalStyle;/u);
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
