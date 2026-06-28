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
