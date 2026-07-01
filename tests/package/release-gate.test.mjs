import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const sourceRoot = new URL('../../src/', import.meta.url);
const repositoryRoot = new URL('../../', import.meta.url);

const requiredCheckScripts = [
  'check:runtime',
  'check:jsr',
  'check:fixtures',
  'check:acceptance',
  'check:conformance',
  'check:integration',
  'check:package',
  'check:performance',
  'check:property',
  'check:security',
  'check:unit'
];

test('release check is composed from explicit product suite lanes', () => {
  const scripts = packageJson.scripts;
  assert.equal(typeof scripts.lint, 'string');
  assert.equal(typeof scripts.build, 'string');
  assert.match(scripts.build, /rm -rf dist/u);
  assert.equal(typeof scripts.check, 'string');

  for (const scriptName of requiredCheckScripts) {
    assert.equal(typeof scripts[scriptName], 'string', scriptName);
    assert.ok(scripts.check.includes(`npm run ${scriptName}`), scriptName);
  }
});

test('terminal-ui source does not own low-level argv tokenization', async () => {
  const files = await sourceFiles(sourceRoot);
  const forbiddenPatterns = [
    /\bsplitShellCommandLine\b/u,
    /\bsplitArgv\b/u,
    /\btokenizeArgv\b/u,
    /\bcommand-line\.ts\b/u,
    /input\.split\(\s*\/\\s\+/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('TUI render, layout, and accessibility delegate widget behavior through the registry', async () => {
  const centralFiles = [
    '../../src/tui/render.ts',
    '../../src/tui/layout.ts',
    '../../src/tui/render-accessibility.ts'
  ];
  for (const relativePath of centralFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /switch\s*\(\s*widget\.kind\s*\)/u, relativePath);
    assert.doesNotMatch(source, /case\s+['"`](?:text|box|stack|row|list|table|inputField|statusBar|progressBar|spinner|viewport|custom)['"`]/u, relativePath);
  }

  const behavior = await readFile(new URL('../../src/tui/widget-behavior.ts', import.meta.url), 'utf8');
  const registry = await readFile(new URL('../../src/tui/renderers/index.ts', import.meta.url), 'utf8');

  await assert.rejects(access(new URL('../../src/tui/renderers/support.ts', import.meta.url)));
  assert.match(behavior, /builtinWidgetRenderers\[widget\.kind\]/u);
  assert.doesNotMatch(behavior, /const\s+widgetRenderers\s*=/u);
  assert.doesNotMatch(behavior, /satisfies Record<BuiltinWidgetKind, WidgetRenderer>/u);
  assert.doesNotMatch(behavior, /from\s+['"]\.\/(?:form-widgets|menu-widgets|drawing-widgets|table|chart-widgets|data-widgets|palette|command-bar|progress-widget|structured-block)['"]/u);
  assert.match(registry, /satisfies Record<BuiltinWidgetKind, WidgetRenderer>/u);
  assert.doesNotMatch(registry, /custom:\s*\{\s*\}/u);
  assert.doesNotMatch(registry, /\?\.\(widget,\s*node,\s*id,\s*focused\)/u);

  const rendererFiles = [
    '../../src/tui/renderers/text-renderers.ts',
    '../../src/tui/renderers/form-renderers.ts',
    '../../src/tui/renderers/menu-renderers.ts',
    '../../src/tui/renderers/data-renderers.ts',
    '../../src/tui/renderers/layout-renderers.ts',
    '../../src/tui/renderers/drawing-renderers.ts',
    '../../src/tui/renderers/feedback-renderers.ts',
    '../../src/tui/renderers/support/block.ts',
    '../../src/tui/renderers/support/border.ts',
    '../../src/tui/renderers/support/common.ts',
    '../../src/tui/renderers/support/layout.ts',
    '../../src/tui/renderers/support/list.ts',
    '../../src/tui/renderers/support/scroll.ts',
    '../../src/tui/renderers/support/tabs.ts',
    '../../src/tui/renderers/support/viewport.ts'
  ];

  for (const rendererFile of rendererFiles) {
    const url = new URL(rendererFile, import.meta.url);
    await access(url);
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(source, /from\s+['"]\.\.\/widget-behavior\.ts['"]/u, rendererFile);
  }
});

test('widget modules do not write directly to terminal hosts', async () => {
  const widgetFiles = [
    ...await sourceFiles(new URL('../../src/widgets/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/tui/', import.meta.url))
  ];
  const forbiddenPatterns = [
    /\bhost\.write\s*\(/u,
    /\bprocess\.stdout\b/u,
    /\bprocess\.stderr\b/u,
    /\bDeno\.stdout\b/u,
    /\bBun\.write\b/u
  ];

  for (const file of widgetFiles) {
    const source = await readFile(file, 'utf8');
    if (file.pathname.endsWith('/src/tui/runtime-frame.ts') || file.pathname.endsWith('/src/tui/non-tty.ts')) continue;
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('widget rendering code uses semantic styles instead of raw terminal colors', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/widgets/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/tui/', import.meta.url))
  ].filter((file) => ![
    '/src/tui/ansi.ts',
    '/src/tui/serialization-policy.ts',
    '/src/tui/render-primitives.ts',
    '/src/tui/frame.ts'
  ].some((suffix) => file.pathname.endsWith(suffix)));
  const forbiddenPatterns = [
    /\bkind:\s*['"]ansi['"]/u,
    /\bkind:\s*['"]rgb['"]/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('documentation local links resolve', async () => {
  const docs = [
    new URL('../../README.md', import.meta.url),
    ...await sourceFiles(new URL('../../docs/', import.meta.url), '.md')
  ];

  for (const file of docs) {
    const source = await readFile(file, 'utf8');
    for (const link of markdownLinks(source)) {
      if (!isLocalDocumentationLink(link)) continue;
      const target = linkTarget(file, link);
      await access(target);
    }
  }
});

test('source has no compatibility wrapper or obsolete render model markers', async () => {
  const files = await sourceFiles(sourceRoot);
  const forbiddenPatterns = [
    /@deprecated/u,
    /\bcompat(?:ibility)?(?:Shim|Wrapper|Alias|Layer)\b/iu,
    /\blegacy(?:Frame|Render|Layout|Widget)\b/u,
    /\bold(?:Frame|Render|Layout|Widget)\b/u,
    ...removedMouseApiPatterns(),
    /\bfirstChangedColumnInRow\b/u,
    /\bsameJson\b/u,
    /\bcontentTrackSize\b/u,
    /\browLevelDiff\b/u,
    /\bunstyledFrame\b/u,
    /\bincludeControlSequences\b/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('removed mouse-map API names do not appear in active tests docs or examples', async () => {
  const files = [
    ...await sourceFiles(new URL('../../docs/', import.meta.url), '.md'),
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.mjs'),
    ...await sourceFiles(new URL('../../tests/', import.meta.url), '.mjs')
  ].filter((file) => !file.pathname.endsWith('/tests/package/release-gate.test.mjs'));

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of removedMouseApiPatterns()) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('frame contract remains styled source-aware cells, spans, blocks, and buffer based', async () => {
  const frameSource = await readFile(new URL('../../src/tui/frame.ts', import.meta.url), 'utf8');
  const primitiveSource = await readFile(new URL('../../src/tui/render-primitives.ts', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../../schemas/tui-frame.schema.json', import.meta.url), 'utf8');

  for (const required of [
    'readonly width: number;',
    'readonly style?: TerminalStyle;',
    'readonly link?: TerminalLink;',
    'readonly source?: FrameCellSource;',
    'readonly continuation?: boolean;'
  ]) {
    assert.ok(frameSource.includes(required), required);
  }

  for (const required of [
    'export interface RenderSpan',
    'export interface RenderLine',
    'export interface RenderBlock'
  ]) {
    assert.ok(primitiveSource.includes(required), required);
  }

  const frameSchema = JSON.parse(schema);
  const cellProperties = frameSchema.properties.cells.items.properties;
  for (const property of ['width', 'style', 'link', 'source', 'continuation']) {
    assert.ok(Object.hasOwn(cellProperties, property), property);
  }
});

test('widget rendering layer has no command, clipboard, host-output, or raw ANSI side effects', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/widgets/', import.meta.url)),
    ...await namedTuiSourceFiles([
      'border.ts',
      'chart-widgets.ts',
      'command-bar.ts',
      'data-widgets.ts',
      'drawing-widgets.ts',
      'form-widgets.ts',
      'menu-widgets.ts',
      'palette.ts',
      'scrollback.ts',
      'structured-block.ts',
      'table.ts',
      'text-widgets.ts',
      'tree.ts',
      'widget-behavior.ts',
      'widget-renderer.ts'
    ])
  ];
  const forbiddenPatterns = [
    /\bnode:child_process\b/u,
    /\bchild_process\b/u,
    /\bspawn\s*\(/u,
    /\bexec(?:File)?\s*\(/u,
    /\bclipboard\b/iu,
    /\bnavigator\.clipboard\b/u,
    /\bwriteText\s*\(/u,
    /\bhost\.write\s*\(/u,
    /\\u001[Bb]|\\x1b|\\033/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('rendering and layout code do not read runtime globals', async () => {
  const renderFiles = await namedTuiSourceFiles([
    'ansi.ts',
    'frame-buffer.ts',
    'render.ts',
    'render-accessibility.ts',
    'render-primitives.ts',
    'widget-behavior.ts',
    'widget-renderer.ts'
  ]);
  const layoutFiles = await namedTuiSourceFiles([
    'focus.ts',
    'layout.ts',
    'regions.ts'
  ]);

  for (const file of [...renderFiles, ...layoutFiles]) {
    const source = runtimeSource(await readFile(file, 'utf8'));
    assert.doesNotMatch(source, /\b(?:process|Deno|Bun)\./u, file.pathname);
    assert.doesNotMatch(source, /\bglobalThis\b/u, file.pathname);
    assert.doesNotMatch(source, /\bReflect\.get\b/u, file.pathname);
  }

  for (const file of layoutFiles) {
    const source = runtimeSource(await readFile(file, 'utf8'));
    assert.doesNotMatch(source, /\bTerminalHost\b/u, file.pathname);
    assert.doesNotMatch(source, /\bhost\b/u, file.pathname);
    assert.doesNotMatch(source, /\bcapabilities\b/u, file.pathname);
  }
});

test('runtime hot paths use precomputed theme fingerprints', async () => {
  const runtimeFiles = await namedTuiSourceFiles([
    'runtime.ts',
    'runtime-frame.ts'
  ]);

  for (const file of runtimeFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /JSON\.stringify\s*\(/u, file.pathname);
  }

  const themeSource = await readFile(new URL('../../src/theme/index.ts', import.meta.url), 'utf8');
  assert.match(themeSource, /readonly fingerprint: string;/u);
  assert.match(themeSource, /fingerprint: themeFingerprint/u);
});

test('TUI widgets and examples use scheduler sources instead of raw timers', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/tui/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/widgets/', import.meta.url)),
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.mjs')
  ];
  const forbiddenPatterns = [
    /\bsetTimeout\s*\(/u,
    /\bsetInterval\s*\(/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('terminal text indexing and editing stay centralized', async () => {
  const sourceFilesToCheck = [
    ...await sourceFiles(sourceRoot),
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.mjs')
  ];
  const textSources = [
    '/src/text/graphemes.ts',
    '/src/text/measure.ts',
    '/src/text/terminal-text-index.ts'
  ];

  for (const file of sourceFilesToCheck) {
    const source = await readFile(file, 'utf8');
    if (!textSources.some((suffix) => file.pathname.endsWith(suffix))) {
      assert.doesNotMatch(source, /\bnew Intl\.Segmenter\b/u, file.pathname);
      assert.doesNotMatch(source, /Extended_Pictographic/u, file.pathname);
    }
  }

  const showcaseSources = await Promise.all(
    (await sourceFiles(new URL('../../examples/showcase/', import.meta.url), '.mjs')).map(async (file) => ({
      file,
      source: await readFile(file, 'utf8')
    }))
  );
  const showcase = showcaseSources.map((entry) => entry.source).join('\n');
  const commandBar = await readFile(new URL('../../src/tui/command-bar.ts', import.meta.url), 'utf8');
  const commandSurface = await readFile(new URL('../../src/tui/command-surface.ts', import.meta.url), 'utf8');
  const formWidgets = await readFile(new URL('../../src/tui/form-widgets.ts', import.meta.url), 'utf8');
  const textWidgets = await readFile(new URL('../../src/tui/text-widgets.ts', import.meta.url), 'utf8');
  const textRenderers = await readFile(new URL('../../src/tui/renderers/text-renderers.ts', import.meta.url), 'utf8');
  const textTypes = await readFile(new URL('../../src/text/types.ts', import.meta.url), 'utf8');
  const textAreaEdit = await readFile(new URL('../../src/text/text-area-edit.ts', import.meta.url), 'utf8');

  assert.match(showcase, /from '@ismail-elkorchi\/terminal-ui\/text'/u);
  assert.match(showcase, /\beditTextBuffer\b/u);
  assert.doesNotMatch(showcase, /\.slice\(0,\s*-1\)/u);
  assert.match(commandBar, /from '\.\/text-display\.ts'/u);
  assert.match(commandBar, /from '\.\/text-highlight\.ts'/u);
  assert.match(commandSurface, /\bmoveWordLeft\b/u);
  assert.match(commandSurface, /\bselectAll\b/u);
  assert.match(formWidgets, /from '\.\/text-display\.ts'/u);
  assert.match(textWidgets, /from '\.\/text-display\.ts'/u);
  assert.match(textRenderers, /from '\.\.\/text-display\.ts'/u);
  assert.doesNotMatch(textTypes, /\bmoveLineStart\b/u);
  assert.doesNotMatch(textTypes, /\bmoveLineEnd\b/u);
  assert.doesNotMatch(textAreaEdit, /\bmoveLineStart\b/u);
  assert.doesNotMatch(textAreaEdit, /\bmoveLineEnd\b/u);
  assert.doesNotMatch(commandBar, /function matchSpans/u);
  assert.doesNotMatch(commandBar, /lowerText\.indexOf/u);
  const palette = await readFile(new URL('../../src/tui/palette.ts', import.meta.url), 'utf8');
  const scrollback = await readFile(new URL('../../src/tui/scrollback.ts', import.meta.url), 'utf8');
  assert.match(palette, /from '\.\/text-highlight\.ts'/u);
  assert.match(scrollback, /from '\.\/text-highlight\.ts'/u);
  assert.doesNotMatch(palette, /function matchSpans/u);
  assert.doesNotMatch(scrollback, /lowerText\.indexOf/u);
});

test('TUI ANSI serialization decisions are owned by the internal policy', async () => {
  const policy = await readFile(new URL('../../src/tui/serialization-policy.ts', import.meta.url), 'utf8');
  const ansi = await readFile(new URL('../../src/tui/ansi.ts', import.meta.url), 'utf8');
  const frame = await readFile(new URL('../../src/tui/frame.ts', import.meta.url), 'utf8');

  assert.match(policy, /export interface TerminalSerializationPolicy/u);
  assert.match(policy, /readonly capabilities: TerminalCapabilityProfile;/u);
  assert.match(policy, /resetStyle\(\): string;/u);
  assert.match(policy, /styleTransition\(previous: TerminalStyle \| undefined, next: TerminalStyle \| undefined\): string;/u);
  assert.match(ansi, /createTerminalSerializationPolicy\(options\)/u);
  assert.match(frame, /createTerminalSerializationPolicy\(options\)/u);

  for (const file of await sourceFiles(new URL('../../src/tui/', import.meta.url))) {
    if (file.pathname.endsWith('/src/tui/serialization-policy.ts')) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\\u001[Bb]|\\u0007|\\x1b|\\033/u, file.pathname);
  }
});

test('frame passes are applied before snapshots and remain serialization-free', async () => {
  const renderSource = await readFile(new URL('../../src/tui/render.ts', import.meta.url), 'utf8');
  assert.match(renderSource, /const buffer = compositeRegions\(viewport, regions\);[\s\S]*applyFramePasses\(buffer/u);
  assert.match(renderSource, /const frame = buffer\.snapshot/u);

  for (const file of await sourceFiles(new URL('../../src/tui/frame-passes/', import.meta.url))) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /renderDiffAnsi|renderFrameAnsi|serializeRenderSpans|ansi|ANSI|\\u001[Bb]|\\x1b|\\033/u, file.pathname);
  }
});

test('runtime input routing uses the committed render cache', async () => {
  const runtime = await readFile(new URL('../../src/tui/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /createInputPipeline\(options\.input\)/u);
  assert.doesNotMatch(runtime, /createInputDecoder\(/u);
  assert.doesNotMatch(runtime, /\blayoutWidget\(/u);
  assert.match(runtime, /\bensureRender\(\)/u);
  assert.match(runtime, /findWidgetFocusTarget\(current\.widget, current\.layout/u);
  assert.match(runtime, /createPointerRouter<TMessage>\(\)/u);
  assert.match(runtime, /pointerRouter\.route\(current\.regions, event\)/u);
  assert.doesNotMatch(runtime, /collectWidgetLayoutTargets\(current\.widget, current\.layout\)/u);
  assert.doesNotMatch(runtime, /widgetHitTargets\(/u);
});

test('RenderRegion replaces the obsolete render layer model', async () => {
  const renderSource = await readFile(new URL('../../src/tui/render.ts', import.meta.url), 'utf8');
  const regionSource = await readFile(new URL('../../src/tui/render-regions.ts', import.meta.url), 'utf8');
  const tuiEntrypoint = await readFile(new URL('../../src/tui/index.ts', import.meta.url), 'utf8');
  const rootEntrypoint = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');

  assert.match(regionSource, /interface RenderRegion/u);
  assert.match(regionSource, /regionIdForLayoutNode/u);
  assert.match(regionSource, /readonly opacity: RegionOpacity;/u);
  assert.match(regionSource, /readonly metadata: FrameBufferSnapshotMetadata;/u);
  assert.match(regionSource, /translateSnapshotMetadata/u);
  assert.match(regionSource, /createRegionFrameBuffer/u);
  assert.match(renderSource, /composer\.regionFor/u);
  assert.match(renderSource, /renderWidgetRegions/u);
  assert.match(renderSource, /compositeRegions/u);
  assert.doesNotMatch(renderSource, /id:\s*`z:\$\{String\([^`]+zIndex[^`]+`\s*,/u);
  assert.doesNotMatch(renderSource, /buffer:\s*createFrameBuffer\(viewport\.columns,\s*viewport\.rows\)/u);
  for (const [label, source] of [['render', renderSource], ['regions', regionSource], ['tui', tuiEntrypoint], ['root', rootEntrypoint]]) {
    assert.doesNotMatch(source, /\bRenderLayer\b/u, label);
    assert.doesNotMatch(source, /\bMutableRenderLayer\b/u, label);
    assert.doesNotMatch(source, /\bLayerComposer\b/u, label);
    assert.doesNotMatch(source, /\bRenderRegionInternal\b/u, label);
    assert.doesNotMatch(source, /\brenderWidgetLayers\b/u, label);
    assert.doesNotMatch(source, /\bcompositeLayers\b/u, label);
  }
});

test('dirty region narrowing is structural and render-diff visible', async () => {
  const dirtySource = await readFile(new URL('../../src/tui/dirty-regions.ts', import.meta.url), 'utf8');
  const frameBufferSource = await readFile(new URL('../../src/tui/frame-buffer.ts', import.meta.url), 'utf8');
  const frameSource = await readFile(new URL('../../src/tui/frame.ts', import.meta.url), 'utf8');
  const runtimeFrameSource = await readFile(new URL('../../src/tui/runtime-frame.ts', import.meta.url), 'utf8');

  assert.match(dirtySource, /export interface DirtyRegionSet/u);
  assert.match(dirtySource, /dirtyRegionsForRegionChanges/u);
  assert.match(dirtySource, /metadata\.fingerprint/u);
  assert.match(dirtySource, /rowFingerprints/u);
  assert.match(dirtySource, /writtenBounds/u);
  assert.match(dirtySource, /clearedBounds/u);
  assert.doesNotMatch(dirtySource, /sameRegionCells/u);
  assert.doesNotMatch(dirtySource, /toSorted\(compareCellPosition\)/u);
  assert.match(frameBufferSource, /export interface FrameBufferSnapshotMetadata/u);
  assert.match(frameBufferSource, /readonly writtenBounds: DirtyRegionSet;/u);
  assert.match(frameBufferSource, /readonly clearedBounds: DirtyRegionSet;/u);
  assert.match(frameBufferSource, /readonly rowFingerprints: readonly FrameRowFingerprint\[\];/u);
  assert.match(frameSource, /readonly dirtyRegions\?: readonly Rect\[\];/u);
  assert.match(frameSource, /dirtyColumnRanges/u);
  assert.match(runtimeFrameSource, /dirtyRegionsForRenderCommit/u);
  assert.doesNotMatch(dirtySource, /widget\.kind|contextMenu|dropdown|modal/u);
});

test('box drawing joins are source-role gated frame passes', async () => {
  const borderSource = await readFile(new URL('../../src/tui/border.ts', import.meta.url), 'utf8');
  const joinPass = await readFile(new URL('../../src/tui/frame-passes/box-drawing-join.ts', import.meta.url), 'utf8');
  const rendererSources = await Promise.all(
    (await sourceFiles(new URL('../../src/tui/renderers/', import.meta.url))).map(async (file) => ({
      file,
      source: await readFile(file, 'utf8')
    }))
  );

  assert.match(borderSource, /source:\s*\{\s*kind:\s*'box',\s*role:\s*'border'\s*\}/u);
  assert.match(joinPass, /cell\.source\?\.role === 'border' \|\| cell\.source\?\.role === 'separator'/u);
  assert.doesNotMatch(joinPass, /source\?\.role !== 'text'/u);
  for (const { file, source } of rendererSources) {
    assert.doesNotMatch(source, /boxDrawingJoin|joinedDirections|glyphForDirections/u, file.pathname);
  }
});

test('custom widgets can render only through buffer-scoped renderer inputs', async () => {
  const rendererTypes = await readFile(new URL('../../src/tui/widget-renderer.ts', import.meta.url), 'utf8');
  const widgetTypes = await readFile(new URL('../../src/widgets/types.ts', import.meta.url), 'utf8');
  const factories = await readFile(new URL('../../src/widgets/factories.ts', import.meta.url), 'utf8');
  const validation = await readFile(new URL('../../src/widgets/extension-validation.ts', import.meta.url), 'utf8');

  assert.match(rendererTypes, /interface WidgetRenderInput/u);
  assert.match(rendererTypes, /readonly buffer: FrameBuffer;/u);
  assert.match(rendererTypes, /renderChildren\(target\?: FrameBuffer\): void;/u);
  assert.doesNotMatch(rendererTypes, /\bTerminalHost\b/u);
  assert.doesNotMatch(rendererTypes, /\bhost\b/u);
  assert.doesNotMatch(rendererTypes, /\bwrite\s*\(/u);

  const customRuntimeTypes = widgetTypes.slice(
    widgetTypes.indexOf('export interface CustomWidgetRuntime'),
    widgetTypes.indexOf('export interface CustomWidgetOptions')
  );
  const customOptionTypes = widgetTypes.slice(
    widgetTypes.indexOf('export interface CustomWidgetOptions'),
    widgetTypes.indexOf('export interface TextWidgetOptions')
  );
  const canvasOptionTypes = widgetTypes.slice(
    widgetTypes.indexOf('export interface CanvasWidgetOptions'),
    widgetTypes.indexOf('export interface SurfaceWidgetOptions')
  );
  assert.match(customRuntimeTypes, /readonly renderer: WidgetRenderer<TMessage>;/u);
  assert.match(customOptionTypes, /readonly renderer: WidgetRenderer<TMessage>;/u);
  assert.doesNotMatch(customOptionTypes, /\breadonly painter\b/u);
  assert.match(canvasOptionTypes, /readonly painter: CanvasPainter;/u);
  assert.doesNotMatch(canvasOptionTypes, /\breadonly renderer\b/u);
  assert.match(widgetTypes, /export interface CanvasPainterInput[\s\S]*readonly buffer: FrameBuffer;[\s\S]*readonly bounds: Rect;/u);
  assert.match(widgetTypes, /export interface CanvasPainterInput[\s\S]*readonly buffer: FrameBuffer;[\s\S]*readonly canvas: Canvas2D;[\s\S]*readonly bounds: Rect;/u);
  assert.doesNotMatch(customRuntimeTypes, /\bTerminalHost\b/u);
  assert.doesNotMatch(customRuntimeTypes, /\bclipboard\b/iu);

  assert.match(factories, /assertCanvasPainter\(options\.painter\)/u);
  assert.match(factories, /assertCustomRenderer\(options\.renderer/u);
  assert.match(factories, /kind: 'custom'/u);
  assert.doesNotMatch(factories, /\bhost\b/u);
  assert.doesNotMatch(validation, /\bTerminalHost\b/u);
  assert.doesNotMatch(validation, /\bhost\b/u);
  assert.doesNotMatch(validation, /\bwrite\s*\(/u);
});

test('Canvas2D is a FrameBuffer-backed helper without host or ANSI escapes', async () => {
  const canvasSources = await Promise.all(
    (await sourceFiles(new URL('../../src/tui/canvas2d/', import.meta.url))).map(async (file) => ({
      file,
      source: await readFile(file, 'utf8')
    }))
  );
  const drawingSource = await readFile(new URL('../../src/tui/drawing-widgets.ts', import.meta.url), 'utf8');
  const widgetTypes = await readFile(new URL('../../src/widgets/types.ts', import.meta.url), 'utf8');

  assert.match(drawingSource, /createCanvas2D\(input\.buffer,\s*input\.node\.bounds\)/u);
  assert.match(widgetTypes, /readonly buffer: FrameBuffer;/u);
  assert.match(widgetTypes, /readonly canvas: Canvas2D;/u);
  for (const { file, source } of canvasSources) {
    assert.doesNotMatch(source, /\bprocess\b|\bfs\b|\bTerminalHost\b|\x1B/u, file.pathname);
  }
});

async function sourceFiles(directory, extension = '.ts') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(new URL(`${entry.name}/`, directory), extension));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) files.push(child);
  }
  return files.sort((left, right) => left.pathname.localeCompare(right.pathname));
}

async function namedTuiSourceFiles(names) {
  return names.map((name) => new URL(`../../src/tui/${name}`, import.meta.url));
}

function markdownLinks(source) {
  return [...source.matchAll(/(?<!!)\[[^\]]+\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)]
    .map((match) => match.groups?.target)
    .filter((target) => typeof target === 'string');
}

function isLocalDocumentationLink(link) {
  return !link.startsWith('#')
    && !link.startsWith('http://')
    && !link.startsWith('https://')
    && !link.startsWith('mailto:')
    && !link.startsWith('file:');
}

function linkTarget(file, link) {
  const [path] = link.split('#');
  if (path === undefined || path.length === 0) return file;
  return path.startsWith('/')
    ? new URL(`.${path}`, repositoryRoot)
    : new URL(path, file);
}

function runtimeSource(source) {
  return source
    .split('\n')
    .filter((line) => !line.startsWith('import type '))
    .join('\n');
}

function removedMouseApiPatterns() {
  return [
    new RegExp(`\\b${'mouse' + 'Map'}\\b`, 'u'),
    new RegExp(`\\b${'Widget' + 'Mouse' + 'Map'}\\b`, 'u')
  ];
}
