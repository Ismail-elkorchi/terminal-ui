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
  assert.equal(typeof terminalUi.intervalSource, 'function');
  assert.equal(typeof terminalUi.button, 'function');
  assert.equal(typeof terminalUi.grid, 'function');
  assert.equal(typeof terminalUi.tableColumn, 'function');
  assert.equal(typeof terminalUi.behavior.textInputReducer, 'function');
});

test('transcript entrypoint exposes replay against a structural harness target', async () => {
  const { replayTranscript } = await import('@ismail-elkorchi/terminal-ui/transcript');
  const { createTerminalHarness } = await import('@ismail-elkorchi/terminal-ui/testing');
  const harness = createTerminalHarness();

  const result = await replayTranscript(harness, {
    formatVersion: 3,
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
      renderElementSnapshot,
      type ControlledTerminalClock,
      type PtyTerminalHarness
    } from '@ismail-elkorchi/terminal-ui/testing';
    import { text } from '@ismail-elkorchi/terminal-ui';

    const harness = createTerminalHarness();
    const output: string = harness.output();
    const clock: ControlledTerminalClock = harness.clock;
    declare const pty: PtyTerminalHarness;
    pty.closeInput();
    const snapshot = renderElementSnapshot({
      element: text({ content: 'Ready' }),
      terminalSize: { columns: 20, rows: 2 }
    });

    void output;
    void clock;
    void snapshot.frame;
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
  const componentDefinitionDeclaration = await readFile(
    new URL('../../dist/component/definition.d.ts', import.meta.url),
    'utf8'
  );
  const rendererDeclaration = await readFile(new URL('../../dist/renderer/index.d.ts', import.meta.url), 'utf8');
  const rendererContractsDeclaration = await readFile(new URL('../../dist/renderer/contracts.d.ts', import.meta.url), 'utf8');
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
  for (const helper of [
    'gridCellRects',
    'layoutBoxBounds',
    'layoutContentBounds',
    'layoutInsetSize',
    'splitTracks'
  ]) {
    assert.match(layoutDeclaration, new RegExp(`\\b${helper}\\b`, 'u'), `layout:${helper}`);
  }

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
    'TableAction',
    'TreeAction'
  ]) {
    assert.match(behaviorDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `behavior:${typeName}`);
  }

  for (const typeName of [
    'Frame',
    'FrameBuffer',
    'FrameCellSource',
    'Layer',
    'Measurement',
    'LayoutNode',
    'Rect',
    'RenderDiff',
    'RenderInstrumentation',
    'RenderSpan'
  ]) {
    assert.match(rendererDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `renderer:${typeName}`);
  }
  assert.doesNotMatch(rendererContractsDeclaration, /(?:^|from )['"].*\/model\//mu);
  for (const typeName of [
    'ComponentDefinition',
    'ComponentRenderInput',
    'Element',
    'RenderTarget'
  ]) {
    assert.match(componentDefinitionDeclaration, new RegExp(`\\b${typeName}\\b`, 'u'), `component:${typeName}`);
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

  assert.doesNotMatch(componentDefinitionDeclaration, /\bRenderNode\b/u);
  assert.doesNotMatch(componentElementDeclaration, /\bRenderNode\b/u);
  assert.doesNotMatch(componentElementDeclaration, /\b(?:elementFromRenderNode|toRenderNode|toRenderNodes)\b/u);
  assert.doesNotMatch(componentElementDeclaration, /readonly \[key: string\]: unknown;/u);

});

test('component definitions and border title slots expose usable structural contracts', () => {
  assertNoTypeDiagnostics(`
    import {
      defineComponent,
      type ComponentInput
    } from '@ismail-elkorchi/terminal-ui/component';
    import { text } from '@ismail-elkorchi/terminal-ui/components';
    import { surface } from '@ismail-elkorchi/terminal-ui/layout';

    const focusTarget = ({ bounds }: ComponentInput<Record<never, never>>) => [{
      id: 'field', bounds, disabled: false, order: 1, scopeId: 'form'
    }];
    const marker = defineComponent({
      name: 'terminal-ui-tests/components/marker',
      identity: 'required',
      structure: 'leaf',
      semantics: 'semantic',
      measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
      render: () => undefined,
      accessibility: ({ id, focused }) => ({ id, role: 'button', label: id, ...(focused ? { focused } : {}) }),
      focusTargets: focusTarget
    });
    const element = surface(text({ content: 'Title' }), {
      title: { start: 'Start', center: 'Center', end: 'End' },
      border: { kind: 'single', titleAlign: 'center' }
    });

    void marker({ id: 'marker' });
    void element;
  `);
});

test('public renderer helpers accept component elements', () => {
  assertNoTypeDiagnostics(`
    import { dialog, tabs, text } from '@ismail-elkorchi/terminal-ui/components';
    import { column } from '@ismail-elkorchi/terminal-ui/layout';
    import { layoutElement, renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    const panels = tabs({
      id: 'tabs',
      tabs: [{ id: 'main', label: 'Main', panel: text({ content: 'x', id: 'x' }) }],
      onAction: (action) => action
    });
    const element = column([
      dialog({
        slots: { content: panels },
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

test('component packages can use the narrow authoring entrypoint', () => {
  assertNoTypeDiagnostics(`
    import {
      defineComponent,
      ignoreMessage,
      type IgnoredMessage,
      type Element
    } from '@ismail-elkorchi/terminal-ui/component';
    import { button } from '@ismail-elkorchi/terminal-ui/components';
    import { renderElementSnapshot } from '@ismail-elkorchi/terminal-ui/testing';

    type Message = { readonly kind: 'activate' };
    const ignored: IgnoredMessage = ignoreMessage();
    void ignored;

    const meterComponent = defineComponent<
      { readonly value: number },
      { readonly value: number }
    >({
      name: 'terminal-ui-tests/components/meter',
      identity: 'required',
      structure: 'leaf',
      semantics: 'semantic',
      optionFields: { value: null },
      prepare(value) {
        if (typeof value !== 'object' || value === null || !('value' in value) || typeof value.value !== 'number') {
          throw new TypeError('meter requires a numeric value');
        }
        return { value: value.value };
      },
      measure: () => ({
        minWidth: 1,
        minHeight: 1,
        preferredWidth: 3,
        preferredHeight: 1
      }),
      render({ model, target }) {
        target.write(0, 0, [{ text: String(model.value) }]);
      },
      accessibility: ({ id, model }) => ({
        id,
        role: 'meter',
        label: 'Usage',
        numericValue: { current: model.value, minimum: 0, maximum: 100 }
      })
    });

    function meter(value: number): Element {
      return meterComponent({ id: 'meter', value });
    }

    const action = button({
      id: 'activate',
      label: 'Activate',
      onAction: (): Message => ({ kind: 'activate' })
    });
    const panelComponent = defineComponent({
      name: 'terminal-ui-tests/components/componentPanel',
      identity: 'required',
      structure: 'composite',
      semantics: 'semantic',
      slots: {
        content: { cardinality: 'many', owner: 'caller', messages: 'bubble' }
      } as const,
      measure: ({ childCount, measureChild }) => {
        const children = Array.from(
          { length: childCount },
          (_unused, index) => measureChild(index)
        );
        return {
          minWidth: Math.max(0, ...children.map((child) => child.minWidth)),
          minHeight: children.reduce((height, child) => height + child.minHeight, 0),
          preferredWidth: Math.max(0, ...children.map((child) => child.preferredWidth)),
          preferredHeight: children.reduce(
            (height, child) => height + child.preferredHeight,
            0
          )
        };
      },
      layout: ({ bounds, slots }) => ({
        content: Array.from({ length: slots.count('content') }, (_unused, index) => ({
          row: index,
          column: 0,
          width: bounds.width,
          height: index < bounds.height ? 1 : 0
        }))
      }),
      accessibility: ({ id, children }) => ({
        id,
        role: 'group',
        label: 'Panel',
        children
      })
    });
    const element = panelComponent({
      id: 'panel',
      slots: { content: [meter(42), action] as const }
    });
    const snapshot = renderElementSnapshot({
      element,
      terminalSize: { columns: 20, rows: 3 }
    });

    void snapshot.accessibilityJson;
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
  const element = text({ content: 'valid element' });

  assert.equal(Object.isFrozen(element), true);
  assert.deepEqual(Reflect.ownKeys(element), []);
  assert.equal('kind' in element, false);
  assert.equal('props' in element, false);
  assert.equal(renderFramePlain(renderElementFrame(element, { columns: 20, rows: 3 })), 'valid element');

  assert.throws(
    () => renderElementFrame(invalid, { columns: 10, rows: 3 }),
    /Expected an Element created by a terminal-ui component or layout factory/u
  );
  assert.throws(
    () => column([invalid]),
    /Expected an Element created by a terminal-ui component or layout factory/u
  );

  let trapCalls = 0;
  const hostile = new Proxy({}, {
    has() {
      trapCalls += 1;
      throw new Error('has trap must not run');
    },
    get() {
      trapCalls += 1;
      throw new Error('get trap must not run');
    }
  });
  assert.throws(
    () => renderElementFrame(hostile, { columns: 10, rows: 3 }),
    /peer dependency.*externalize/u
  );
  assert.equal(trapCalls, 0);
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
