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
  assert.equal(typeof terminalUi.intervalSource, 'function');
  assert.equal(typeof terminalUi.timeoutSource, 'function');
  assert.equal(typeof terminalUi.animationSource, 'function');
  assert.equal(typeof terminalUi.contrastColor, 'function');
  assert.equal(typeof terminalUi.ensureContrast, 'function');
  assert.equal(typeof terminalUi.deriveSurface, 'function');
  assert.equal(typeof terminalUi.themePacks, 'object');
  assert.equal(typeof terminalUi.commandBarReducer, 'function');
  assert.equal(typeof terminalUi.dataWindow, 'function');
  assert.equal(typeof terminalUi.rowWindow, 'function');
  assert.equal(typeof terminalUi.scrollStateFromUnknown, 'function');
  assert.equal(typeof terminalUi.paletteWindow, 'function');
  assert.equal(typeof terminalUi.placeTooltip, 'function');
  assert.equal(typeof terminalUi.placeNotificationStack, 'function');
  assert.equal(typeof terminalUi.filterPaletteEntries, 'function');
  assert.equal(typeof terminalUi.screenStackReducer, 'function');
  assert.equal(typeof terminalUi.activeScreen, 'function');
  assert.equal(typeof terminalUi.splitTracks, 'function');
  assert.equal(typeof terminalUi.gridCellRects, 'function');
  assert.equal(typeof terminalUi.highlightRenderSpans, 'function');
  assert.equal(typeof terminalUi.canvasTransform, 'function');
  assert.equal(typeof terminalUi.transformCanvasPoint, 'function');
  assert.equal(typeof terminalUi.drawLineSeries, 'function');
  assert.equal(typeof terminalUi.drawBarSeries, 'function');
  assert.equal(typeof terminalUi.drawAxes, 'function');
  assert.equal(typeof terminalUi.ellipseStrokePoints, 'function');
  assert.equal(typeof terminalUi.polygonInteriorPoints, 'function');
  assert.equal(typeof terminalUi.widgets.tableReducer, 'function');
  assert.equal(typeof terminalUi.widgets.sortTableRows, 'function');
  assert.equal(typeof terminalUi.widgets.treeReducer, 'function');
  assert.equal(typeof terminalUi.widgets.treeStateReducer, 'function');
  assert.equal(typeof terminalUi.widgets.treeNodeMatches, 'function');
  assert.equal(typeof terminalUi.widgets.paletteReducer, 'function');
  assert.equal(typeof terminalUi.widgets.groupPaletteEntries, 'function');
  assert.equal(typeof terminalUi.widgets.paletteStatus, 'function');
  assert.equal(typeof terminalUi.widgets.hoverableReducer, 'function');
  assert.equal(typeof terminalUi.widgets.hoverableActive, 'function');
  assert.equal(typeof terminalUi.widgets.notificationReducer, 'function');
  assert.equal(typeof terminalUi.widgets.visibleNotifications, 'function');
  assert.equal(typeof terminalUi.widgets.notificationsToActivityBlocks, 'function');
  assert.equal(typeof terminalUi.widgets.notificationStack, 'function');
  assert.equal(typeof terminalUi.widgets.paginatedTable, 'function');
  assert.equal(typeof terminalUi.widgets.virtualTable, 'function');
  assert.equal(typeof terminalUi.widgets.defineBreakpoints, 'function');
  assert.equal(typeof terminalUi.widgets.responsive, 'function');
  assert.equal(typeof terminalUi.widgets.viewportVariant, 'function');
  assert.equal(typeof terminalUi.widgets.areaGrid, 'function');
  assert.equal(typeof terminalUi.widgets.gauge, 'function');
  assert.equal(typeof terminalUi.widgets.heatmap, 'function');
  assert.equal(typeof terminalUi.widgets.toggleSwitch, 'function');
  assert.equal(typeof terminalUi.widgets.slider, 'function');
  assert.equal(typeof terminalUi.widgets.rangeSlider, 'function');
  assert.equal(typeof terminalUi.widgets.checkboxList, 'function');
  assert.equal(typeof terminalUi.widgets.colorPicker, 'function');
  assert.equal(typeof terminalUi.widgets.datePicker, 'function');
  assert.equal(typeof terminalUi.widgets.panel, 'function');
  assert.equal(typeof terminalUi.widgets.topBar, 'function');
  assert.equal(typeof terminalUi.widgets.bottomBar, 'function');
  assert.equal(typeof terminalUi.widgets.sidePanel, 'function');
  assert.equal(typeof terminalUi.widgets.toolbar, 'function');
  assert.equal(typeof terminalUi.widgets.actionBar, 'function');
  assert.equal(typeof terminalUi.widgets.statusDock, 'function');
  assert.equal(typeof terminalUi.widgets.commandDock, 'function');
  assert.equal(typeof terminalUi.widgets.contentHeader, 'function');
  assert.equal(typeof terminalUi.widgets.drawer, 'function');
  assert.equal(typeof terminalUi.widgets.messageBox, 'function');
  assert.equal(typeof terminalUi.widgets.confirmDialog, 'function');
  assert.equal(typeof terminalUi.widgets.inputDialog, 'function');
  assert.equal(typeof terminalUi.widgets.wizardDialog, 'function');
  assert.equal(typeof terminalUi.widgets.floatingWindow, 'function');
  assert.equal(typeof terminalUi.widgets.windowReducer, 'function');
  assert.equal(typeof terminalUi.widgets.fileExplorer, 'function');
  assert.equal(typeof terminalUi.widgets.fileDialog, 'function');
  assert.equal(typeof terminalUi.widgets.fileExplorerEntriesToTreeNodes, 'function');
  assert.equal(typeof terminalUi.widgets.fileExplorerBreadcrumbs, 'function');
  assert.equal(typeof terminalUi.widgets.breadcrumb, 'function');
  assert.equal(typeof terminalUi.widgets.collapsibleSection, 'function');
  assert.equal(typeof terminalUi.widgets.accordion, 'function');
  assert.equal(typeof terminalUi.widgets.carousel, 'function');
  assert.equal(typeof terminalUi.widgets.tabOverflowMenu, 'function');
  assert.equal(typeof terminalUi.widgets.shortcutBar, 'function');
  assert.equal(typeof terminalUi.widgets.scrollbackReducer, 'function');
  assert.equal(typeof terminalUi.widgets.scrollbackSearchMarks, 'function');
  assert.equal(typeof terminalUi.widgets.followTailScrollState, 'function');
  assert.equal(typeof terminalUi.widgets.progressStatus, 'function');
  assert.equal(typeof terminalUi.widgets.indeterminateProgressFrame, 'function');
  assert.equal(typeof terminalUi.widgets.activityFeedReducer, 'function');
  assert.equal(typeof terminalUi.widgets.visibleActivityFeedBlocks, 'function');
  assert.equal(typeof terminalUi.widgets.copyActivityFeedVisibleText, 'function');
  assert.equal(typeof terminalUi.layoutWidget, 'function');
  assert.equal(typeof terminalUi.renderWidgetFrame, 'function');
  assert.equal(typeof terminalUi.renderWidgetRegions, 'function');
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
    'TextEditHistory',
    'TextEditHistoryOperation',
    'TextEditOperation',
    'TextHighlightMatch',
    'TextHighlightOptions',
    'ExtractTextSelectionInput',
    'TuiNonTtyPolicy',
    'PaginationWindow',
    'TreeAction',
    'TreeState',
    'TreeStateAction',
    'SpinnerAction',
    'SpinnerReducerOptions',
    'SpinnerState',
    'TableColumn',
    'TerminalTheme',
    'ThemeToken',
    'ThemeColor',
    'TerminalSymbols',
    'BorderGlyphSet',
    'BorderKind',
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
    'DataWindow',
    'DataWindowInput',
    'CommandBarWidgetOptions',
    'CommandBarValidation',
    'CommandBarValidationTone',
    'CommandPaletteWidgetOptions',
    'AreaGridWidgetOptions',
    'PaletteEntry',
    'PaletteAction',
    'PaletteState',
    'PaletteAsyncState',
    'PaletteWidgetOptions',
    'PaginatedTableOptions',
    'FormWidgetOptions',
    'FieldWidgetOptions',
    'GaugeVariant',
    'GaugeWidgetOptions',
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
    'DividerLineKind',
    'DividerOrientation',
    'DividerWidgetOptions',
    'TooltipPlacement',
    'TooltipTone',
    'TooltipWidgetOptions',
    'TooltipPlacementInput',
    'TooltipSize',
    'NotificationAction',
    'NotificationItem',
    'NotificationPlacement',
    'NotificationReducerOptions',
    'NotificationStackPlacementInput',
    'NotificationStackSize',
    'NotificationStackWidgetOptions',
    'NotificationState',
    'NotificationTone',
    'BreakpointRange',
    'ResponsiveBreakpointMap',
    'ResponsiveVariants',
    'ViewportDimensions',
    'DialogAction',
    'MessageBoxOptions',
    'ConfirmDialogOptions',
    'InputDialogOptions',
    'WizardDialogOptions',
    'WizardStep',
    'FloatingWindowOptions',
    'WindowAction',
    'WindowGeometry',
    'WindowReducerOptions',
    'NavigationAction',
    'BreadcrumbOptions',
    'CollapsibleSectionOptions',
    'AccordionItem',
    'AccordionOptions',
    'CarouselItem',
    'CarouselOptions',
    'TabOverflowItem',
    'TabOverflowMenuOptions',
    'ShortcutItem',
    'ShortcutBarOptions',
    'HoverableAction',
    'HoverableState',
    'CanvasPainter',
    'CanvasPainterInput',
    'Canvas2D',
    'CanvasTransform',
    'CanvasTransformInput',
    'ChartScale',
    'ChartPoint',
    'ChartPointEvent',
    'ChartPointSelection',
    'ChartAxesOptions',
    'ChartSeriesKind',
    'StrokeFillOptions',
    'CanvasPoint',
    'BlockGlyph',
    'BrailleCellPoint',
    'AxisLine',
    'TooltipLine',
    'SurfaceVariant',
    'CanvasWidgetOptions',
    'SurfaceWidgetOptions',
    'AbsoluteWidgetOptions',
    'OverlayWidgetOptions',
    'RichTextWidgetOptions',
    'ScrollbackAction',
    'ScrollbackSearchMark',
    'ScrollbackState',
    'GridWidgetOptions',
    'SplitPaneWidgetOptions',
    'TabsWidgetOptions',
    'ModalWidgetOptions',
    'TableCellRenderInput',
    'TableAction',
    'TableColumnAlignment',
    'TableColumnWidth',
    'TableReducerOptions',
    'TableSortState',
    'TableState',
    'TableSortDirection',
    'CustomWidgetOptions',
    'WidgetLayerOptions',
    'RegionOpacity',
    'WidgetFocusOptions',
    'WidgetFocusScope',
    'WidgetRenderer',
    'WidgetRenderInput',
    'WidgetAccessibilityInput',
    'FocusTarget',
    'HitTarget',
    'FrameHitTarget',
    'FrameBufferSnapshot',
    'FrameBufferSnapshotMetadata',
    'FrameBufferSnapshotOptions',
    'FrameRowFingerprint',
    'HighlightRenderSpan',
    'HighlightRenderSpansOptions',
    'RenderRegion',
    'RenderRegionHitTarget',
    'DirtyRegionSet',
    'DiffFramesOptions',
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
    'HeatmapCell',
    'HeatmapSelection',
    'HeatmapWidgetOptions',
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
    'VisualSnapshotInput',
    'VirtualTableOptions'
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
