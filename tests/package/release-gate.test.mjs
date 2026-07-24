import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { testLaneNames } from '../../scripts/test-discovery.mjs';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const ciWorkflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const sourceRoot = new URL('../../src/', import.meta.url);
const repositoryRoot = new URL('../../', import.meta.url);

const fastCheckScripts = [
  'check:test-inventory',
  'check:contracts',
  'check:test-types',
  'check:acceptance',
  'check:conformance',
  'check:integration',
  'check:package',
  'check:property',
  'check:security',
  'check:unit'
];

const fullOnlyCheckScripts = [
  'check:runtime',
  'check:jsr',
  'check:performance'
];

test('release check is composed from explicit suite lanes', () => {
  const scripts = packageJson.scripts;
  assert.equal(typeof scripts.lint, 'string');
  assert.equal(typeof scripts.build, 'string');
  assert.match(scripts.build, /node scripts\/clean\.mjs/u);
  assert.equal(typeof scripts.check, 'string');
  assert.equal(typeof scripts['check:fast'], 'string');

  for (const scriptName of [...fastCheckScripts, ...fullOnlyCheckScripts]) {
    assert.equal(typeof scripts[scriptName], 'string', scriptName);
  }
  for (const scriptName of fastCheckScripts) {
    assert.ok(scripts['check:fast'].includes(`npm run ${scriptName}`), scriptName);
  }
  assert.ok(scripts.check.includes('npm run check:fast'));
  for (const scriptName of fullOnlyCheckScripts) {
    assert.ok(scripts.check.includes(`npm run ${scriptName}`), scriptName);
  }
});

test('test lanes use recursive discovery instead of shell globs', () => {
  const scripts = packageJson.scripts;
  for (const lane of testLaneNames) {
    assert.equal(scripts[`check:${lane}`], `node scripts/run-test-lane.mjs ${lane}`);
  }
});

test('host smoke CI runs only the installed Node runtime coverage', () => {
  const hostSmoke = workflowJob(ciWorkflow, 'host-smoke');
  const linuxFull = workflowJob(ciWorkflow, 'linux-full');

  assert.match(hostSmoke, /node scripts\/runtime-smoke\.mjs/u);
  assert.match(hostSmoke, /node --test tests\/integration\/node-host-lifecycle\.test\.mjs/u);
  assert.doesNotMatch(hostSmoke, /tests\/runtime\/runtime-smoke\.test\.mjs|npm run check:runtime/u);
  assert.match(linuxFull, /denoland\/setup-deno/u);
  assert.match(linuxFull, /oven-sh\/setup-bun/u);
  assert.match(linuxFull, /npm run check:runtime/u);
});

test('package scripts do not keep generated fixture maintenance lanes', () => {
  const scripts = packageJson.scripts;
  assert.equal(Object.hasOwn(scripts, 'fixtures:update'), false);
  assert.equal(Object.hasOwn(scripts, 'check:fixtures'), false);
  assert.doesNotMatch(scripts.check, /fixtures/u);
});

test('terminal-ui source does not own low-level argv tokenization', async () => {
  const files = await sourceFiles(sourceRoot);
  const forbiddenPatterns = [
    /\bsplitCommandLine\b/u,
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

test('TUI render, layout, and accessibility delegate render-node behavior through the registry', async () => {
  const centralFiles = [
    '../../src/renderer/internal/render.ts',
    '../../src/renderer/internal/layout.ts',
    '../../src/renderer/internal/render-accessibility.ts'
  ];
  for (const relativePath of centralFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /switch\s*\(\s*renderNode\.kind\s*\)/u, relativePath);
    assert.doesNotMatch(source, /case\s+['"`](?:text|surface|column|row|list|table|textInput|statusBar|progressBar|spinner|viewport|custom)['"`]/u, relativePath);
  }

  const behavior = await readFile(new URL('../../src/renderer/internal/render-node-behavior.ts', import.meta.url), 'utf8');
  const registry = await readFile(new URL('../../src/renderer/internal/renderers/index.ts', import.meta.url), 'utf8');

  await assert.rejects(access(new URL('../../src/tui/renderers/support.ts', import.meta.url)));
  assert.match(behavior, /builtinRenderNodeRenderers\[renderNode\.kind\]/u);
  assert.doesNotMatch(behavior, /const\s+renderNodeRenderers\s*=/u);
  assert.doesNotMatch(behavior, /satisfies Record<BuiltinRenderNodeKind, RenderNodeRenderer>/u);
  assert.doesNotMatch(behavior, /from\s+['"]\.\/(?:forms|charts|menu-rendering|drawing-rendering|table|data-rendering|palette|command-input|progress-bar-rendering|structured-block)(?:\/index)?['"]/u);
  assert.match(registry, /type BuiltinRendererRegistry = \{[\s\S]*RenderNodeRenderer<unknown, TKind>/u);
  assert.match(registry, /satisfies BuiltinRendererRegistry/u);
  assert.doesNotMatch(registry, /custom:\s*\{\s*\}/u);
  assert.doesNotMatch(registry, /\?\.\(renderNode,\s*node,\s*id,\s*focused\)/u);

  const rendererFiles = [
    '../../src/renderer/internal/renderers/text-renderers.ts',
    '../../src/renderer/internal/renderers/form-renderers.ts',
    '../../src/renderer/internal/renderers/menu-renderers.ts',
    '../../src/renderer/internal/renderers/data-renderers.ts',
    '../../src/renderer/internal/renderers/layout-renderers.ts',
    '../../src/renderer/internal/renderers/drawing-renderers.ts',
    '../../src/renderer/internal/renderers/feedback-renderers.ts',
    '../../src/renderer/internal/renderers/support/block.ts',
    '../../src/renderer/internal/renderers/support/border.ts',
    '../../src/renderer/internal/renderers/support/common.ts',
    '../../src/renderer/internal/renderers/support/layout.ts',
    '../../src/renderer/internal/renderers/support/list.ts',
    '../../src/renderer/internal/renderers/support/scroll.ts',
    '../../src/renderer/internal/renderers/support/tabs.ts',
    '../../src/renderer/internal/renderers/support/viewport.ts'
  ];

  for (const rendererFile of rendererFiles) {
    const url = new URL(rendererFile, import.meta.url);
    await access(url);
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(source, /from\s+['"]\.\.\/widget-behavior\.ts['"]/u, rendererFile);
  }
});

test('element and renderer modules do not write directly to terminal hosts', async () => {
  const renderingFiles = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/layout/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/', import.meta.url))
  ];
  const forbiddenPatterns = [
    /\bhost\.write\s*\(/u,
    /\bprocess\.stdout\b/u,
    /\bprocess\.stderr\b/u,
    /\bDeno\.stdout\b/u,
    /\bBun\.write\b/u
  ];

  for (const file of renderingFiles) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('element rendering code uses semantic styles instead of raw terminal colors', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/layout/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/', import.meta.url))
  ].filter((file) => ![
    '/src/renderer/internal/ansi.ts',
    '/src/renderer/internal/serialization-policy.ts',
    '/src/renderer/internal/frame.ts'
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

test('examples stay hand-written and generated visual fixture trees stay absent', async () => {
  for (const directory of [
    '../../docs/gallery/',
    '../../tests/fixtures/'
  ]) {
    await assert.rejects(access(new URL(directory, import.meta.url)), directory);
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
    ...await exampleSourceFiles(),
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
  const frameSource = await readFile(new URL('../../src/renderer/model/frame.ts', import.meta.url), 'utf8');
  const primitiveSource = await readFile(new URL('../../src/visual/render.ts', import.meta.url), 'utf8');
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

test('renderer layer has no command, clipboard, host-output, or raw ANSI side effects', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/charts/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/forms/', import.meta.url)),
    ...await namedRendererSourceFiles([
      'border.ts',
      'command-input.ts',
      'data-rendering.ts',
      'drawing-rendering.ts',
      'menu-rendering.ts',
      'palette.ts',
      'scrollback.ts',
      'structured-block.ts',
      'table.ts',
      'text-rendering.ts',
      'tree.ts',
      'render-node-behavior.ts',
      '../model/renderer.ts'
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
  const renderFiles = await namedRendererSourceFiles([
    'ansi.ts',
    'frame-buffer.ts',
    'render.ts',
    'render-accessibility.ts',
    'render-node-behavior.ts',
    '../model/renderer.ts'
  ]);
  const layoutFiles = await namedRendererSourceFiles([
    'layout.ts'
  ]);
  layoutFiles.push(new URL('../../src/interaction/focus.ts', import.meta.url));
  layoutFiles.push(new URL('../../src/renderer/internal/layout-geometry.ts', import.meta.url));

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

  const themeSource = await readFile(new URL('../../src/theme/theme.ts', import.meta.url), 'utf8');
  assert.match(themeSource, /readonly fingerprint: string;/u);
  assert.match(themeSource, /fingerprint: themeFingerprint/u);
});

test('TUI components and examples use scheduler sources instead of raw timers', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/tui/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await exampleSourceFiles()
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
    ...await exampleSourceFiles()
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

  const commandInput = await readFile(new URL('../../src/renderer/internal/command-input.ts', import.meta.url), 'utf8');
  const commandSurface = await readFile(new URL('../../src/behavior/command-input-state.ts', import.meta.url), 'utf8');
  const commandVisual = await readFile(new URL('../../src/renderer/internal/command-visual.ts', import.meta.url), 'utf8');
  const formRendering = await readSourceTree(new URL('../../src/renderer/internal/forms/', import.meta.url));
  const formVisual = await readFile(new URL('../../src/renderer/internal/form-visual.ts', import.meta.url), 'utf8');
  const formRenderers = await readFile(new URL('../../src/renderer/internal/renderers/form-renderers.ts', import.meta.url), 'utf8');
  const inputVisual = await readFile(new URL('../../src/renderer/internal/input-visual.ts', import.meta.url), 'utf8');
  const menuRendering = await readFile(new URL('../../src/renderer/internal/menu-rendering.ts', import.meta.url), 'utf8');
  const menuVisual = await readFile(new URL('../../src/renderer/internal/menu-visual.ts', import.meta.url), 'utf8');
  const feedbackRenderers = await readFile(new URL('../../src/renderer/internal/renderers/feedback-renderers.ts', import.meta.url), 'utf8');
  const feedbackVisual = await readFile(new URL('../../src/renderer/internal/feedback-visual.ts', import.meta.url), 'utf8');
  const documentVisual = await readFile(new URL('../../src/renderer/internal/document-visual.ts', import.meta.url), 'utf8');
  const chartRendering = await readSourceTree(new URL('../../src/renderer/internal/charts/', import.meta.url));
  const chartVisual = await readFile(new URL('../../src/renderer/internal/chart-visual.ts', import.meta.url), 'utf8');
  const dataRenderers = await readFile(new URL('../../src/renderer/internal/renderers/data-renderers.ts', import.meta.url), 'utf8');
  const textRendering = await readFile(new URL('../../src/renderer/internal/text-rendering.ts', import.meta.url), 'utf8');
  const textAreaProjection = await readFile(new URL('../../src/renderer/internal/text-area/projection.ts', import.meta.url), 'utf8');
  const textRenderers = await readFile(new URL('../../src/renderer/internal/renderers/text-renderers.ts', import.meta.url), 'utf8');
  const structuredBlock = await readFile(new URL('../../src/renderer/internal/structured-block.ts', import.meta.url), 'utf8');
  const textTypes = await readFile(new URL('../../src/text/types.ts', import.meta.url), 'utf8');

  assert.match(commandInput, /from '\.\/text-display\.ts'/u);
  assert.match(commandInput, /from '\.\/command-visual\.ts'/u);
  assert.match(commandVisual, /from '\.\/text-highlight\.ts'/u);
  assert.match(commandSurface, /import \{ editTextBuffer \} from '\.\.\/text\/index\.ts';/u);
  assert.match(commandSurface, /editTextBuffer\(state\.input, action\.operation\)/u);
  assert.doesNotMatch(commandSurface, /case 'moveWordLeft'/u);
  assert.match(formRendering, /from '\.\.\/\.\.\/text-display\.ts'/u);
  assert.match(formRendering, /from '\.\.\/\.\.\/input-visual\.ts'/u);
  assert.match(formRendering, /from '\.\.\/form-visual\.ts'/u);
  assert.match(formVisual, /\bformSpan\b/u);
  assert.match(formVisual, /\boptionControlState\b/u);
  assert.match(inputVisual, /from '\.\/text-display\.ts'/u);
  assert.match(menuRendering, /from '\.\/menu-visual\.ts'/u);
  assert.match(menuVisual, /\bmenuItemLine\b/u);
  assert.match(feedbackRenderers, /from '\.\.\/feedback-visual\.ts'/u);
  assert.match(feedbackVisual, /\bstatusBarBlock\b/u);
  assert.match(feedbackVisual, /\bhelpBarBlock\b/u);
  assert.match(feedbackVisual, /\bstatusIndicatorBlock\b/u);
  assert.match(documentVisual, /\bdocumentHighlightSpans\b/u);
  assert.match(documentVisual, /\bdocumentFieldSpans\b/u);
  assert.match(chartRendering, /from '\.\.\/chart-visual\.ts'/u);
  assert.match(chartVisual, /\bchartStateBlock\b/u);
  assert.match(dataRenderers, /\bsparklineBlock\b/u);
  assert.match(dataRenderers, /\bbarChartBlock\b/u);
  assert.match(dataRenderers, /\bchartBlock\b/u);
  assert.match(dataRenderers, /\bmeterBlock\b/u);
  assert.match(dataRenderers, /\bheatmapBlock\b/u);
  assert.match(textRendering, /from '\.\/input-visual\.ts'/u);
  assert.match(textRendering, /from '\.\/text-area\/projection\.ts'/u);
  assert.match(textAreaProjection, /from '\.\.\/\.\.\/\.\.\/text\/index\.ts'/u);
  assert.match(textRendering, /from '\.\/feedback-visual\.ts'/u);
  assert.match(textRenderers, /from '\.\.\/feedback-visual\.ts'/u);
  assert.match(formRenderers, /\btextInputBlock\b/u);
  assert.doesNotMatch(textTypes, /\bmoveLineStart\b/u);
  assert.doesNotMatch(textTypes, /\bmoveLineEnd\b/u);
  assert.doesNotMatch(commandInput, /function matchSpans/u);
  assert.doesNotMatch(commandInput, /lowerText\.indexOf/u);
  assert.doesNotMatch(menuRendering, /function menuItemStyle/u);
  assert.doesNotMatch(feedbackRenderers, /\bwriteBlock\b/u);
  assert.doesNotMatch(dataRenderers, /sparklineText|barChartText|chartText|meterText|heatmapText/u);
  const palette = await readFile(new URL('../../src/renderer/internal/palette.ts', import.meta.url), 'utf8');
  const scrollback = await readFile(new URL('../../src/renderer/internal/scrollback.ts', import.meta.url), 'utf8');
  assert.match(palette, /from '\.\/command-visual\.ts'/u);
  assert.match(scrollback, /from '\.\/document-visual\.ts'/u);
  assert.match(structuredBlock, /from '\.\/document-visual\.ts'/u);
  assert.doesNotMatch(scrollback, /from '\.\/text-highlight\.ts'/u);
  assert.doesNotMatch(palette, /function matchSpans/u);
  assert.doesNotMatch(scrollback, /lowerText\.indexOf/u);
});

test('TUI ANSI serialization decisions are owned by the internal policy', async () => {
  const policy = await readFile(new URL('../../src/renderer/internal/serialization-policy.ts', import.meta.url), 'utf8');
  const ansi = await readFile(new URL('../../src/renderer/internal/ansi.ts', import.meta.url), 'utf8');
  const planner = await readFile(new URL('../../src/renderer/internal/output-planner.ts', import.meta.url), 'utf8');
  const frame = await readFile(new URL('../../src/renderer/internal/frame.ts', import.meta.url), 'utf8');

  assert.match(policy, /export interface TerminalSerializationPolicy/u);
  assert.match(policy, /readonly capabilities: TerminalOutputCapabilityProfile;/u);
  assert.match(policy, /resetStyle\(\): string;/u);
  assert.match(policy, /styleTransition\(previous: TerminalStyle \| undefined, next: TerminalStyle \| undefined\): string;/u);
  assert.match(policy, /beginSynchronizedOutput\(\): string;/u);
  assert.match(policy, /endSynchronizedOutput\(\): string;/u);
  assert.match(ansi, /createTerminalSerializationPolicy\(options\)/u);
  assert.match(planner, /createTerminalSerializationPolicy\(options\)/u);
  assert.match(frame, /planTerminalOutput\(diff, options\)\.text/u);

  for (const file of await sourceFiles(new URL('../../src/renderer/internal/', import.meta.url))) {
    if (file.pathname.endsWith('/src/renderer/internal/serialization-policy.ts')
      || file.pathname.endsWith('/src/renderer/internal/ansi.ts')) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\\u001[Bb]|\\u0007|\\x1b|\\033/u, file.pathname);
  }
});

test('frame passes are applied before snapshots and remain serialization-free', async () => {
  const renderSource = await readFile(new URL('../../src/renderer/internal/render.ts', import.meta.url), 'utf8');
  const composition = renderSource.indexOf("measureRenderStage(options.instrumentation, 'composition'");
  const framePasses = renderSource.indexOf("measureRenderStage(options.instrumentation, 'frame_passes'");
  const snapshot = renderSource.indexOf("measureRenderStage(options.instrumentation, 'snapshot'");
  assert.equal(composition >= 0, true);
  assert.equal(framePasses > composition, true);
  assert.equal(snapshot > framePasses, true);
  assert.match(renderSource, /applyFramePasses\(buffer/u);
  assert.match(renderSource, /buffer\.snapshot/u);

  for (const file of await sourceFiles(new URL('../../src/renderer/internal/frame-passes/', import.meta.url))) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /renderDiffAnsi|renderFrameAnsi|serializeRenderSpans|ansi|ANSI|\\u001[Bb]|\\x1b|\\033/u, file.pathname);
  }
});

test('render request indexes structural targets once', async () => {
  const renderSource = await readFile(new URL('../../src/renderer/internal/render.ts', import.meta.url), 'utf8');
  const targetIndexSource = await readFile(new URL('../../src/renderer/internal/region-target-index.ts', import.meta.url), 'utf8');
  const outputPlannerSource = await readFile(new URL('../../src/renderer/internal/output-planner.ts', import.meta.url), 'utf8');

  assert.equal((renderSource.match(/createRegionTargetIndex\(/gu) ?? []).length, 1);
  assert.doesNotMatch(renderSource, /collectRenderNodeLayoutTargets|collectRenderNodeFocusTargets/u);
  assert.equal((targetIndexSource.match(/collectRenderNodeLayoutTargets\(/gu) ?? []).length, 1);
  assert.equal((targetIndexSource.match(/collectLayoutFocusTargets\(/gu) ?? []).length, 1);
  const rendererSources = await sourceFiles(new URL('../../src/renderer/internal/renderers/', import.meta.url));
  const measurementSources = rendererSources.filter((file) => file.pathname.endsWith('-measurements.ts'));
  assert.equal(measurementSources.length, 7);
  for (const file of measurementSources) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\b1000\b/u, file.pathname);
    assert.doesNotMatch(source, /measureBuiltinRenderNode/u, file.pathname);
  }
  assert.equal((outputPlannerSource.match(/encodeOperations\(/gu) ?? []).length, 2);
  assert.match(outputPlannerSource, /evaluateOperations\(diff, operations, policy, false\)/u);
  assert.match(outputPlannerSource, /evaluateOperations\(diff, operations, policy, true\)/u);

  const scrollbackSource = await readFile(new URL('../../src/renderer/internal/scrollback.ts', import.meta.url), 'utf8');
  assert.match(scrollbackSource, /const scrollbackWindowCache = new WeakMap/u);
  assert.doesNotMatch(scrollbackSource, /scrollbackItemsFromUnknown/u);
});

test('runtime input routing uses the committed render cache', async () => {
  const runtime = await readFile(new URL('../../src/tui/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /createInputPipeline\(options\.input\)/u);
  assert.doesNotMatch(runtime, /createInputDecoder\(/u);
  assert.doesNotMatch(runtime, /\blayoutWidget\(/u);
  assert.match(runtime, /\bensureRender\(\)/u);
  assert.match(runtime, /findRenderNodeFocusTarget\(current\.node, current\.layout/u);
  assert.match(runtime, /createPointerRouter<TMessage>\(\{ now:/u);
  assert.match(runtime, /pointerRouter\.route\(current\.regions, event\)/u);
  assert.doesNotMatch(runtime, /collectRenderNodeLayoutTargets\(current\.node, current\.layout\)/u);
  assert.doesNotMatch(runtime, /hitTargetsForRenderNode\(/u);
});

test('RenderRegion replaces the obsolete render layer model', async () => {
  const renderSource = await readFile(new URL('../../src/renderer/internal/render.ts', import.meta.url), 'utf8');
  const regionSource = await readFile(new URL('../../src/renderer/internal/render-regions.ts', import.meta.url), 'utf8');
  const tuiEntrypoint = await readFile(new URL('../../src/tui/index.ts', import.meta.url), 'utf8');
  const rootEntrypoint = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');

  assert.match(regionSource, /interface RenderRegion/u);
  assert.match(regionSource, /regionIdForLayoutNode/u);
  assert.match(regionSource, /readonly opacity: ElementLayerOpacity;/u);
  assert.match(regionSource, /readonly metadata: FrameBufferSnapshotMetadata;/u);
  assert.match(regionSource, /translateSnapshotMetadata/u);
  assert.match(regionSource, /createRegionFrameBuffer/u);
  assert.match(renderSource, /composer\.regionFor/u);
  assert.match(renderSource, /renderElementRegions/u);
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
  const dirtySource = await readFile(new URL('../../src/renderer/internal/dirty-regions.ts', import.meta.url), 'utf8');
  const frameBufferSource = await readFile(new URL('../../src/renderer/internal/frame-buffer.ts', import.meta.url), 'utf8');
  const diffSource = await readFile(new URL('../../src/renderer/model/diff.ts', import.meta.url), 'utf8');
  const frameSource = await readFile(new URL('../../src/renderer/internal/frame.ts', import.meta.url), 'utf8');
  const frameIndexSource = await readFile(new URL('../../src/renderer/internal/frame-index.ts', import.meta.url), 'utf8');
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
  assert.match(frameBufferSource, /DirtyCoverageAccumulator/u);
  assert.match(frameBufferSource, /snapshotCellsAndFingerprints/u);
  assert.doesNotMatch(frameBufferSource, /this\.writtenBounds\s*=\s*this\.writtenBounds\.add/u);
  assert.doesNotMatch(frameBufferSource, /this\.clearedBounds\s*=\s*this\.clearedBounds\.add/u);
  assert.doesNotMatch(frameBufferSource, /function stableString/u);
  assert.match(diffSource, /readonly dirtyRegions\?: readonly Rect\[\];/u);
  assert.match(frameSource, /dirtyColumnRanges/u);
  assert.match(frameSource, /fingerprintsMatch/u);
  assert.match(frameSource, /frameIndex\(previous\)/u);
  assert.match(frameSource, /frameIndex\(next\)/u);
  assert.match(frameIndexSource, /new WeakMap<Frame, FrameIndex>/u);
  assert.match(frameIndexSource, /metadata\?\.rowFingerprints/u);
  assert.match(runtimeFrameSource, /dirtyRegionsForRenderCommit/u);
  assert.doesNotMatch(dirtySource, /renderNode\.kind|contextMenu|dropdownMenu|modal/u);
});

test('box drawing joins are source-role gated frame passes', async () => {
  const borderSource = await readFile(new URL('../../src/renderer/internal/border.ts', import.meta.url), 'utf8');
  const joinPass = await readFile(new URL('../../src/renderer/internal/frame-passes/box-drawing-join.ts', import.meta.url), 'utf8');
  const rendererSources = await Promise.all(
    (await sourceFiles(new URL('../../src/renderer/internal/renderers/', import.meta.url))).map(async (file) => ({
      file,
      source: await readFile(file, 'utf8')
    }))
  );

  assert.match(borderSource, /function borderSpan\(/u);
  assert.match(borderSource, /frameCellSource\(\{\s*ownerKind:\s*'border',\s*family:\s*'surface',\s*role:\s*'border',\s*part:\s*label,\s*label\s*\}\)/u);
  assert.match(borderSource, /borderSpan\(left,\s*style,\s*'border\.corner'\)/u);
  assert.match(borderSource, /borderSpan\(glyphs\.horizontal\.repeat\(innerWidth\),\s*style,\s*'border\.edge'\)/u);
  assert.match(joinPass, /cell\.source\?\.role === 'border' \|\| cell\.source\?\.role === 'separator'/u);
  assert.doesNotMatch(joinPass, /source\?\.role !== 'text'/u);
  for (const { file, source } of rendererSources) {
    assert.doesNotMatch(source, /boxDrawingJoin|joinedDirections|glyphForDirections/u, file.pathname);
  }
});

test('custom renderers can render only through write-scoped renderer inputs', async () => {
  const rendererTypes = await readFile(new URL('../../src/renderer/model/renderer.ts', import.meta.url), 'utf8');
  const componentOptionTypes = await readSourceTree(new URL('../../src/components/options/', import.meta.url));
  const canvasContract = await readFile(new URL('../../src/renderer/model/canvas.ts', import.meta.url), 'utf8');
  const customElementTypes = await readFile(new URL('../../src/renderer/custom-element.ts', import.meta.url), 'utf8');
  const factories = await readSourceTree(new URL('../../src/components/factories/', import.meta.url));
  const validation = await readFile(new URL('../../src/components/extension-validation.ts', import.meta.url), 'utf8');

  assert.match(rendererTypes, /interface RenderNodeRenderInput/u);
  assert.match(rendererTypes, /readonly buffer: RenderTarget;/u);
  assert.match(rendererTypes, /readonly renderChildren: \(target\?: RenderTarget\) => void;/u);
  assert.doesNotMatch(rendererTypes, /\bTerminalHost\b/u);
  assert.doesNotMatch(rendererTypes, /\bhost\b/u);
  assert.doesNotMatch(rendererTypes, /\bwrite\s*\(/u);

  const canvasOptionTypes = componentOptionTypes.slice(componentOptionTypes.indexOf('export interface CanvasOptions'));
  assert.match(customElementTypes, /readonly renderer: CustomRenderer<TState, TMessage>;/u);
  assert.doesNotMatch(customElementTypes, /\breadonly painter\b/u);
  assert.match(canvasOptionTypes, /readonly painter: CanvasPainter;/u);
  assert.doesNotMatch(canvasOptionTypes, /\breadonly renderer\b/u);
  assert.match(componentOptionTypes, /export type \{ CanvasPainter, CanvasPainterInput \} from '\.\.\/\.\.\/renderer\/model\/canvas\.ts';/u);
  assert.match(canvasContract, /export interface CanvasPainterInput[\s\S]*readonly canvas: Canvas2D;[\s\S]*readonly bounds: Rect;/u);
  assert.doesNotMatch(canvasContract, /readonly buffer: FrameBuffer/u);
  assert.doesNotMatch(componentOptionTypes, /\bWidgetRenderer\b/u);
  assert.doesNotMatch(customElementTypes, /\bTerminalHost\b/u);
  assert.doesNotMatch(customElementTypes, /\bclipboard\b/iu);

  assert.match(factories, /assertCanvasPainter\(options\.painter\)/u);
  assert.doesNotMatch(factories, /assertCustomRenderer\(options\.renderer/u);
  assert.doesNotMatch(factories, /kind: 'custom'/u);
  assert.match(customElementTypes, /assertCustomRenderer\(options\.renderer/u);
  assert.match(customElementTypes, /kind: 'custom'/u);
  assert.doesNotMatch(factories, /\bhost\b/u);
  assert.doesNotMatch(validation, /\bTerminalHost\b/u);
  assert.doesNotMatch(validation, /\bhost\b/u);
  assert.doesNotMatch(validation, /\bwrite\s*\(/u);
});

test('Canvas2D is a FrameBuffer-backed helper without host or ANSI escapes', async () => {
  const canvasSources = await Promise.all(
    (await sourceFiles(new URL('../../src/renderer/internal/canvas2d/', import.meta.url))).map(async (file) => ({
      file,
      source: await readFile(file, 'utf8')
    }))
  );
  const drawingSource = await readFile(new URL('../../src/renderer/internal/drawing-rendering.ts', import.meta.url), 'utf8');
  const componentOptionTypes = await readSourceTree(new URL('../../src/components/options/', import.meta.url));
  const canvasContract = await readFile(new URL('../../src/renderer/model/canvas.ts', import.meta.url), 'utf8');

  assert.match(drawingSource, /createCanvas2D\(input\.buffer,\s*input\.layoutNode\.bounds\)/u);
  assert.match(componentOptionTypes, /readonly painter: CanvasPainter;/u);
  assert.match(canvasContract, /readonly canvas: Canvas2D;/u);
  assert.doesNotMatch(canvasContract, /readonly buffer: FrameBuffer/u);
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
    if (entry.isFile()
      && entry.name.endsWith(extension)
      && !(extension === '.ts' && entry.name.endsWith('.test.ts'))) {
      files.push(child);
    }
  }
  return files.sort((left, right) => left.pathname.localeCompare(right.pathname));
}

function workflowJob(source, jobId) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.notEqual(start, -1, `Missing CI job ${jobId}.`);
  const followingJob = lines.slice(start + 1).findIndex((line) => /^  [a-z][a-z0-9-]*:$/u.test(line));
  const end = followingJob === -1 ? lines.length : start + 1 + followingJob;
  return lines.slice(start, end).join('\n');
}

async function exampleSourceFiles() {
  return [
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.ts'),
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.mjs')
  ].sort((left, right) => left.pathname.localeCompare(right.pathname));
}

async function namedTuiSourceFiles(names) {
  return names.map((name) => new URL(`../../src/tui/${name}`, import.meta.url));
}

async function namedRendererSourceFiles(names) {
  return names.map((name) => new URL(`../../src/renderer/internal/${name}`, import.meta.url));
}

async function readSourceTree(directory) {
  return (await Promise.all((await sourceFiles(directory)).map((file) => readFile(file, 'utf8')))).join('\n');
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
