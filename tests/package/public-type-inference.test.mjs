import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTypeDiagnostic, typecheckSource } from './support/typecheck.mjs';

test('public component factories preserve exact and heterogeneous message types', () => {
  const diagnostics = typecheckSource(`
    import { button, richText, type Element } from '@ismail-elkorchi/terminal-ui/components';
    import { row } from '@ismail-elkorchi/terminal-ui/layout';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const passive = richText({ segments: [] });
    const save = button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) });
    const quit = button({ id: 'quit', label: 'Quit', onPress: () => ({ kind: 'quit', force: true } as const) });
    const controlled = button({
      id: 'controlled',
      label: 'Controlled',
      onPress: () => ({ kind: 'activate' } as const),
      pointer: {
        state: { hoveredTargetId: 'controlled:control' },
        onAction: (action) => ({ kind: 'pointer', action } as const)
      }
    });
    const toolbar = row([passive, save, quit] as const);

    type _Passive = Assert<Equal<MessageOf<typeof passive>, never>>;
    type _Save = Assert<Equal<MessageOf<typeof save>, { readonly kind: 'save' }>>;
    type _Toolbar = Assert<Equal<
      MessageOf<typeof toolbar>,
      { readonly kind: 'save' } | { readonly kind: 'quit'; readonly force: true }
    >>;
    type _Controlled = Assert<Equal<
      MessageOf<typeof controlled>,
      | { readonly kind: 'activate' }
      | { readonly kind: 'pointer'; readonly action: import('@ismail-elkorchi/terminal-ui/interaction').PointerPresentationAction }
    >>;
  `, { name: 'public-component-inference' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('custom composite extensions preserve opaque child message unions', () => {
  const diagnostics = typecheckSource(`
    import { button, type Element } from '@ismail-elkorchi/terminal-ui/components';
    import { customComposite } from '@ismail-elkorchi/terminal-ui/renderer';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const save = button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) });
    const cancel = button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' } as const) });
    const composite = customComposite({
      id: 'actions',
      children: [save, cancel] as const,
      renderer: {
        layout: ({ bounds }) => [
          { ...bounds, width: Math.floor(bounds.width / 2) },
          { ...bounds, column: bounds.column + Math.floor(bounds.width / 2), width: bounds.width - Math.floor(bounds.width / 2) }
        ],
        accessibility: ({ id }) => ({ id, role: 'group', label: 'Actions' })
      }
    });

    type _Composite = Assert<Equal<
      MessageOf<typeof composite>,
      { readonly kind: 'save' } | { readonly kind: 'cancel' }
    >>;
  `, { name: 'custom-composite-inference' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('large collection projections are explicit and mutually exclusive with raw data inputs', () => {
  const diagnostics = typecheckSource(`
    import {
      prepareListCollection,
      prepareTableCollection,
      prepareTreeRows
    } from '@ismail-elkorchi/terminal-ui/behavior';
    import { list, table, tree } from '@ismail-elkorchi/terminal-ui/components';

    const listCollection = prepareListCollection(
      ['alpha', 'bravo'],
      (value, index) => ({ id: String(index), label: value }),
      { start: 100, total: 1_000 }
    );
    const tableCollection = prepareTableCollection(
      [{ id: 'one', value: 1 }],
      (row) => row.id,
      { start: 20, total: 500 }
    );
    const treeCollection = prepareTreeRows([{
      node: { id: 'leaf', label: 'Leaf', kind: 'leaf' },
      depth: 0,
      path: ['leaf']
    }], { start: 10, total: 100 });

    list({ id: 'list', collection: listCollection });
    table({
      id: 'table',
      collection: tableCollection,
      columns: [{ id: 'value', value: (row) => row.value }]
    });
    tree({ id: 'tree', collection: treeCollection });

    // @ts-expect-error retained list collections replace raw item/projector inputs
    list({ id: 'mixed-list', collection: listCollection, items: ['alpha'], projectItem: (value) => ({ id: value, label: value }) });
    // @ts-expect-error retained table collections replace raw row identity inputs
    table({ id: 'mixed-table', collection: tableCollection, rows: [{ id: 'two', value: 2 }], getRowId: (row) => row.id });
    // @ts-expect-error retained tree collections replace raw hierarchy inputs
    tree({ id: 'mixed-tree', collection: treeCollection, nodes: [{ id: 'other', label: 'Other', kind: 'leaf' }] });
  `, { name: 'collection-projection-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('message inference preserves every authored value and excludes only the ignored sentinel', () => {
  const diagnostics = typecheckSource(`
    import { button, textInput, type Element } from '@ismail-elkorchi/terminal-ui/components';
    import { ignoreMessage } from '@ismail-elkorchi/terminal-ui/interaction';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const undefinedMessage = button({ id: 'undefined', label: 'Undefined', onPress: () => undefined });
    const nullMessage = button({ id: 'null', label: 'Null', onPress: () => null });
    const booleanMessage = button({ id: 'boolean', label: 'Boolean', onPress: () => true as const });
    const numberMessage = button({ id: 'number', label: 'Number', onPress: () => 42 as const });
    const stringMessage = button({ id: 'string', label: 'String', onPress: () => 'save' as const });
    const arrayMessage = button({ id: 'array', label: 'Array', onPress: () => ['save'] as readonly string[] });
    const tupleMessage = button({ id: 'tuple', label: 'Tuple', onPress: () => ['save', 1] as const });
    const objectMessage = button({ id: 'object', label: 'Object', onPress: () => ({ kind: 'save' } as const) });
    const modified = textInput({
      id: 'modified',
      presentation: { value: '', cursor: 0 },
      keys: {
        enter: () => ignoreMessage(),
        modified: [{
          trigger: { kind: 'key', key: 's', modifiers: { ctrl: true } },
          onKey: () => ({ kind: 'save' } as const)
        }]
      }
    });

    type _Undefined = Assert<Equal<MessageOf<typeof undefinedMessage>, undefined>>;
    type _Null = Assert<Equal<MessageOf<typeof nullMessage>, null>>;
    type _Boolean = Assert<Equal<MessageOf<typeof booleanMessage>, true>>;
    type _Number = Assert<Equal<MessageOf<typeof numberMessage>, 42>>;
    type _String = Assert<Equal<MessageOf<typeof stringMessage>, 'save'>>;
    type _Array = Assert<Equal<MessageOf<typeof arrayMessage>, readonly string[]>>;
    type _Tuple = Assert<Equal<MessageOf<typeof tupleMessage>, readonly ['save', 1]>>;
    type _Object = Assert<Equal<MessageOf<typeof objectMessage>, { readonly kind: 'save' }>>;
    type _Modified = Assert<Equal<MessageOf<typeof modified>, { readonly kind: 'save' }>>;
  `, { name: 'message-value-inference' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('interactive identity, passive inputs, and component anatomy are enforced by public types', () => {
  const diagnostics = typecheckSource(`
    import { button, rangeSlider, text, textInput } from '@ismail-elkorchi/terminal-ui/components';

    button({ id: 'save', label: 'Save' });
    textInput({
      id: 'query',
      presentation: { value: 'term', cursor: 0 },
      meta: {
        styles: {
          parts: { value: { bold: true }, cursor: { underline: true } },
          states: { focused: { bold: true } }
        }
      }
    });

    // @ts-expect-error interactive components require authored identity
    button({ label: 'Save' });
    button({ id: 'disabled-button', label: 'Save', disabled: true });
    // @ts-expect-error pointer press is controlled through pointer presentation
    button({ id: 'legacy-button-state', label: 'Save', state: 'pressed' });
    // @ts-expect-error range sliders retain the shared disabled control contract
    rangeSlider({ id: 'invalid-range-state', presentation: { value: { start: 1, end: 2 }, activeHandle: 'start' }, state: 'disabled' });
    // @ts-expect-error passive text cannot own local input bindings
    text('Passive', { keys: { enter: () => ({ kind: 'invalid' }) } });
    textInput({
      id: 'invalid-style',
      presentation: { value: '', cursor: 0 },
      meta: {
        styles: {
          // @ts-expect-error text inputs do not expose table anatomy
          parts: { headerCell: { bold: true } }
        }
      }
    });
  `, { name: 'component-capability-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('feedback and dialog lifecycle modes are structurally explicit', () => {
  const diagnostics = typecheckSource(`
    import {
      createNotificationState,
      notificationPresentation
    } from '@ismail-elkorchi/terminal-ui/behavior';
    import {
      dialog,
      notificationStack,
      progressBar,
      statusBar,
      text
    } from '@ismail-elkorchi/terminal-ui/components';

    statusBar({ id: 'status' });
    const notifications = createNotificationState();
    notificationStack({
      id: 'live',
      presentation: notificationPresentation(notifications, { mode: 'live' }),
      onDismiss: (id) => ({ kind: 'dismiss' as const, id })
    });
    notificationStack({
      id: 'history',
      presentation: notificationPresentation(notifications, { mode: 'history' }),
      onAction: (action) => ({ kind: 'notification' as const, action }),
      keys: { home: () => ({ kind: 'home' as const }) }
    });
    dialog(text('Body'), {
      id: 'dialog',
      modal: true,
      focusPolicy: { initialFocus: { kind: 'element', elementId: 'confirm' }, returnFocus: 'restore' },
      dismissal: {
        escape: true,
        outsidePress: false,
        onDismiss: (reason) => ({ kind: 'dismiss' as const, reason })
      }
    });
    progressBar({
      id: 'determinate',
      mode: { kind: 'determinate', value: 2, max: 4 }
    });
    progressBar({
      id: 'indeterminate',
      mode: { kind: 'indeterminate', frame: 2 }
    });

    // @ts-expect-error status bars require stable identity
    statusBar({});
    // @ts-expect-error passive live regions do not own local keyboard bindings
    notificationStack({
      id: 'invalid-live',
      presentation: { kind: 'live', items: [] },
      keys: { escape: () => ({ kind: 'invalid' as const }) }
    });
    // @ts-expect-error navigable history requires an action handler
    notificationStack({ id: 'invalid-history', presentation: { kind: 'history', items: [] } });
    // @ts-expect-error dialog modal policy is required
    dialog(text('Body'), { id: 'implicit-dialog' });
    progressBar({
      id: 'contradictory-progress',
      // @ts-expect-error indeterminate progress cannot carry determinate values
      mode: { kind: 'indeterminate', value: 2 }
    });
    // @ts-expect-error progress mode is required
    progressBar({ id: 'implicit-progress', value: 2, max: 4 });
  `, { name: 'feedback-lifecycle-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('item domains share only valid foundations', () => {
  const diagnostics = typecheckSource(`
    import type {
      ChoiceItem,
      MenuActionItem,
      MenuCheckItem,
      MenuItem,
      MenuSubmenuItem,
      SearchEntry,
      SuggestionItem,
      TreeNode
    } from '@ismail-elkorchi/terminal-ui/components';

    const choice: ChoiceItem<number> = { id: 'one', label: 'One', value: 1 };
    const action: MenuActionItem = { kind: 'action', id: 'open', label: 'Open' };
    const check: MenuCheckItem = { kind: 'check', id: 'autosave', label: 'Autosave', checked: true };
    const submenu: MenuSubmenuItem = { kind: 'submenu', id: 'file', label: 'File', children: [action] };
    const menuItems: readonly MenuItem[] = [action, check, submenu];
    const suggestion: SuggestionItem = { value: '/open', label: 'Open' };
    const search: SearchEntry<number> = {
      id: 'file', label: 'File', value: 1, keywords: ['open']
    };
    const tree: TreeNode = { id: 'src', label: 'src', kind: 'branch', expanded: true, children: [] };
    void [choice, menuItems, suggestion, search, tree];

    // @ts-expect-error check items require explicit checked state
    const invalidCheck: MenuCheckItem = { kind: 'check', id: 'bad-check', label: 'Bad' };
    // @ts-expect-error submenus must contain at least one structural child
    const invalidSubmenu: MenuSubmenuItem = { kind: 'submenu', id: 'empty', label: 'Empty', children: [] };
    // @ts-expect-error action items cannot carry submenu children
    const invalidAction: MenuActionItem = { kind: 'action', id: 'bad-action', label: 'Bad', children: [action] };
    void [invalidCheck, invalidSubmenu, invalidAction];

    // @ts-expect-error action items do not become values implicitly
    const invalidChoice: ChoiceItem<number> = action;
    void invalidChoice;
  `, { name: 'item-domain-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('component density uses one exact public vocabulary', () => {
  const diagnostics = typecheckSource(`
    import { table, type ComponentDensity } from '@ismail-elkorchi/terminal-ui/components';

    const compact: ComponentDensity = 'compact';
    const regular: ComponentDensity = 'regular';
    table({
      id: 'jobs',
      rows: [{ id: 'one' }],
      getRowId: (row) => row.id,
      density: compact
    });
    table({
      id: 'regular-jobs',
      rows: [{ id: 'one' }],
      getRowId: (row) => row.id,
      density: regular
    });

    // @ts-expect-error removed table-only density vocabulary
    table({ id: 'dense', rows: [], getRowId: () => '', density: 'dense' });
    // @ts-expect-error removed table-only density vocabulary
    table({ id: 'normal', rows: [], getRowId: () => '', density: 'normal' });
  `, { name: 'component-density-contract' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('inline content keeps authored source internal and color tokens namespaced', () => {
  const diagnostics = typecheckSource(`
    import { button, richText, text, type InlineContent } from '@ismail-elkorchi/terminal-ui/components';
    import { surface } from '@ismail-elkorchi/terminal-ui/layout';

    const content: InlineContent = [
      { kind: 'text', text: 'Open', style: { fg: { kind: 'theme', token: 'text.default' } } },
      { kind: 'symbol', unicode: '→', ascii: '->', accessibleText: 'next' }
    ];
    richText({ segments: content });
    button({
      id: 'open',
      label: 'Open',
      leading: [{ kind: 'symbol', unicode: '◆', ascii: '*', accessibleText: 'status' }],
      meta: { styles: { parts: { label: { fg: { kind: 'theme', token: 'custom.brand' } } } } }
    });
    surface(text('body'), {
      title: [{ kind: 'symbol', unicode: '◆', ascii: '*', accessibleText: 'status' }],
      border: { kind: 'single' }
    });

    // @ts-expect-error frame source metadata is renderer-owned
    richText({ segments: [{ kind: 'text', text: 'unsafe', source: { ownerId: 'caller' } }] });
    // @ts-expect-error symbolic content requires accessible text
    richText({ segments: [{ kind: 'symbol', unicode: '→', ascii: '->' }] });
    surface(text('invalid border title'), {
      // @ts-expect-error border geometry does not own authored title content
      border: { kind: 'single', title: 'Legacy title' }
    });
    surface(text('invalid title source'), {
      // @ts-expect-error surface titles cannot author renderer source metadata
      title: [{ kind: 'text', text: 'Title', source: { ownerId: 'caller' } }]
    });
    button({
      id: 'invalid-token',
      label: 'Invalid',
      meta: {
        styles: {
          // @ts-expect-error custom color tokens require the custom.* namespace
          parts: { label: { fg: { kind: 'theme', token: 'brand.accent' } } }
        }
      }
    });
  `, { name: 'inline-content-contract' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('frame-only renderer helpers accept heterogeneous authored elements', () => {
  const diagnostics = typecheckSource(`
    import { button, text } from '@ismail-elkorchi/terminal-ui/components';
    import { column } from '@ismail-elkorchi/terminal-ui/layout';
    import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    const content = column([
      text('Actions'),
      button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) }),
      button({ id: 'quit', label: 'Quit', onPress: () => ({ kind: 'quit' } as const) })
    ] as const);

    renderElementFrame(content, { columns: 20, rows: 4 });
  `, { name: 'renderer-authored-element-boundary' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('passive container options preserve child message unions', () => {
  const diagnostics = typecheckSource(`
    import { button, type Element } from '@ismail-elkorchi/terminal-ui/components';
    import { overlay, row, column, surface } from '@ismail-elkorchi/terminal-ui/layout';

    type Message =
      | { readonly kind: 'save' }
      | { readonly kind: 'quit' };

    const actions = row([
      button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) }),
      button({ id: 'quit', label: 'Quit', onPress: () => ({ kind: 'quit' } as const) })
    ] as const, { id: 'actions', gap: 1 });
    const panel = surface(column([actions], { id: 'content' }), {
      id: 'panel',
      variant: 'raised'
    });
    const root = overlay([panel], { id: 'root' });
    const accepted: Element<Message> = root;
    void accepted;
  `, { name: 'passive-container-message-inference' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('split pane separates passive layout from controlled resize actions', () => {
  const diagnostics = typecheckSource(`
    import { text, type Element } from '@ismail-elkorchi/terminal-ui/components';
    import { splitPane, type SplitPaneAction } from '@ismail-elkorchi/terminal-ui/layout';
    import {
      createSplitPaneState,
      splitPanePresentation,
      splitPaneReducer
    } from '@ismail-elkorchi/terminal-ui/behavior';

    const passive = splitPane([text('A'), text('B')], {
      direction: 'horizontal',
      sizes: [{ kind: 'fixed', cells: 4 }, { kind: 'fill' }]
    });
    const state = splitPaneReducer(
      createSplitPaneState(2),
      { kind: 'resizeBy', deltaShare: 0.05 }
    );
    const interactive = splitPane([text('A'), text('B')], {
      id: 'panes',
      direction: 'horizontal',
      ...splitPanePresentation(state),
      onAction: (action) => ({ kind: 'split' as const, action })
    });

    const acceptedPassive: Element<never> = passive;
    const acceptedInteractive: Element<{
      readonly kind: 'split';
      readonly action: SplitPaneAction;
    }> = interactive;
    void [acceptedPassive, acceptedInteractive];

    // @ts-expect-error resizable panes require a stable component id
    splitPane([text('A'), text('B')], {
      direction: 'horizontal',
      sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
      onAction: (_action: SplitPaneAction) => ({ kind: 'split' as const })
    });
  `, { name: 'split-pane-controlled-contract' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('table columns retain heterogeneous cell value types', () => {
  const diagnostics = typecheckSource(`
    import {
      table,
      tableColumn,
      type Element,
      type TableCellRenderInput,
      type TableColumn
    } from '@ismail-elkorchi/terminal-ui/components';

    interface ProcessRow {
      readonly pid: number;
      readonly name: string;
      readonly active: boolean;
      readonly state: 'idle' | 'running';
      readonly owner: { readonly handle: string };
    }

    const rows: readonly ProcessRow[] = [{
      pid: 42,
      name: 'worker',
      active: true,
      state: 'running',
      owner: { handle: 'ada' }
    }];
    const column = tableColumn<ProcessRow>();
    const processes = table({
      getRowId: (row) => String(row.pid),
      id: 'processes',
      rows,
      columns: [
        column({
          id: 'pid',
          header: 'PID',
          value: (row) => row.pid,
          render: ({ value }) => value.toFixed(0)
        }),
        column({
          id: 'name',
          header: 'Name',
          value: (row) => row.name,
          render: ({ value }) => value.toUpperCase()
        }),
        column({
          id: 'active',
          value: (row) => row.active,
          render: ({ value }) => value ? 'yes' : 'no'
        }),
        column({
          id: 'state',
          value: (row) => row.state,
          render: ({ value }) => value === 'running' ? 'busy' : 'idle'
        }),
        column({
          id: 'owner',
          value: (row) => row.owner,
          render: ({ value }) => value.handle
        }),
        { id: 'automatic', value: (row) => row.name }
      ],
      presentation: {
        selectedRowId: '42',
        selectedCell: { rowId: '42', column: 1 }
      },
      onAction: (action) => ({
        kind: 'selected' as const,
        action
      })
    });

    const accepted: Element<{
      readonly kind: 'selected';
      readonly action: import('@ismail-elkorchi/terminal-ui/components').TableControlAction;
    }> = processes;
    void accepted;

    const invalidColumn: TableColumn<ProcessRow> = {
      id: 'invalid-renderer',
      value: (row) => row.pid,
      // @ts-expect-error custom renderers must use tableColumn() to preserve the value type
      render: ({ value }: TableCellRenderInput<ProcessRow, number>) => String(value)
    };
    void invalidColumn;
  `, { name: 'typed-table-contract' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('interactive scroll chrome requires a controlled scroll route', () => {
  const diagnostics = typecheckSource(`
    import {
      list,
      palette,
      scrollback,
      text,
      textArea,
      tree,
      type Element,
      type ListAction,
      type ScrollbackAction,
      type TextAreaAction,
      type TreeInteractionAction
    } from '@ismail-elkorchi/terminal-ui/components';
    import { createScrollState } from '@ismail-elkorchi/terminal-ui/behavior';
    import { viewport } from '@ismail-elkorchi/terminal-ui/layout';
    import type { ScrollEvent } from '@ismail-elkorchi/terminal-ui/interaction';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const scroll = createScrollState({ contentRows: 20, contentColumns: 40 });

    const controlledList = list({
      id: 'list',
      items: ['one'],
      projectItem: (value) => ({ id: value, label: value }),
      scroll,
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'list' as const, action })
    });
    const controlledTree = tree({
      id: 'tree',
      nodes: [{ id: 'one', label: 'One', kind: 'leaf' }],
      scroll,
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'tree' as const, action })
    });
    const controlledEditor = textArea({
      id: 'editor',
      presentation: { value: 'value', cursor: 0, scroll },
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'editor' as const, action })
    });
    const controlledLog = scrollback({
      id: 'log',
      items: [{ id: 'one', text: 'One' }],
      scroll,
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'log' as const, action })
    });
    const controlledPalette = palette({
      id: 'palette',
      entries: [{ id: 'one', label: 'One', value: 1 }],
      scroll,
      scrollbar: { visible: 'auto' },
      onScroll: (event) => ({ kind: 'paletteScroll' as const, event })
    });
    const controlledViewport = viewport(text('content'), {
      id: 'viewport',
      scrollRow: 0,
      scrollColumn: 0,
      contentRows: 20,
      contentColumns: 40,
      scrollbar: { visible: 'auto' },
      onScroll: (event) => ({ kind: 'viewportScroll' as const, event })
    });

    type _List = Assert<Equal<
      MessageOf<typeof controlledList>,
      { readonly kind: 'list'; readonly action: ListAction }
    >>;
    type _Tree = Assert<Equal<
      MessageOf<typeof controlledTree>,
      { readonly kind: 'tree'; readonly action: TreeInteractionAction }
    >>;
    type _Editor = Assert<Equal<
      MessageOf<typeof controlledEditor>,
      { readonly kind: 'editor'; readonly action: TextAreaAction }
    >>;
    type _Log = Assert<Equal<
      MessageOf<typeof controlledLog>,
      { readonly kind: 'log'; readonly action: ScrollbackAction }
    >>;
    type _Palette = Assert<Equal<
      MessageOf<typeof controlledPalette>,
      { readonly kind: 'paletteScroll'; readonly event: ScrollEvent }
    >>;
    type _Viewport = Assert<Equal<
      MessageOf<typeof controlledViewport>,
      { readonly kind: 'viewportScroll'; readonly event: ScrollEvent }
    >>;

    // @ts-expect-error list scrollbar requires controlled scroll state and action routing
    list({ id: 'inert-list', items: [], projectItem: () => ({ id: '', label: '' }), scrollbar: { visible: 'auto' } });
    // @ts-expect-error tree scrollbar requires controlled scroll state and action routing
    tree({ id: 'inert-tree', nodes: [], scrollbar: { visible: 'auto' } });
    // @ts-expect-error text-area scrollbar requires scroll presentation and action routing
    textArea({ id: 'inert-editor', presentation: { value: '', cursor: 0 }, scrollbar: { visible: 'auto' } });
    // @ts-expect-error scrollback scrollbar requires controlled scroll state and action routing
    scrollback({ id: 'inert-log', items: [], scrollbar: { visible: 'auto' } });
    // @ts-expect-error palette scrollbar requires controlled scroll state and event routing
    palette({ id: 'inert-palette', entries: [], scrollbar: { visible: 'auto' } });
    // @ts-expect-error viewport scrollbar requires complete metrics and event routing
    viewport(text('content'), { id: 'inert-viewport', contentRows: 20, scrollbar: { visible: 'auto' } });
  `, { name: 'controlled-scroll-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('behavior projections preserve passive and scrollable component variants', () => {
  const diagnostics = typecheckSource(`
    import {
      list,
      scrollback,
      table,
      tree,
      type Element,
      type ListAction,
      type ListControlAction,
      type ScrollbackAction,
      type ScrollbackControlAction,
      type TableAction,
      type TableControlAction,
      type TextAreaControlAction,
      type TreeInteractionAction,
      type TreeControlAction
    } from '@ismail-elkorchi/terminal-ui/components';
    import {
      createScrollState,
      listPresentation,
      listScrollablePresentation,
      scrollbackPresentation,
      scrollbackScrollablePresentation,
      tablePresentation,
      tableScrollablePresentation,
      treePresentation,
      treeScrollablePresentation,
      type PassiveListState,
      type PassiveScrollbackState,
      type PassiveTableState,
      type PassiveTreeState,
      type ScrollableListState,
      type ScrollableScrollbackState,
      type ScrollableTableState,
      type ScrollableTreeState
    } from '@ismail-elkorchi/terminal-ui/behavior';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const scroll = createScrollState({ contentRows: 20, viewportRows: 5 });
    const passiveListState: PassiveListState = {};
    const scrollableListState: ScrollableListState = { scroll };
    const passiveTableState: PassiveTableState = {};
    const scrollableTableState: ScrollableTableState = { scroll };
    const passiveTreeState: PassiveTreeState = { nodes: [] };
    const scrollableTreeState: ScrollableTreeState = { nodes: [], scroll };
    const passiveScrollbackState: PassiveScrollbackState = { foldedIds: [], followTail: false };
    const scrollableScrollbackState: ScrollableScrollbackState = { foldedIds: [], followTail: true, scroll };

    const passiveList = list({
      id: 'passive-list', items: ['one'],
      projectItem: (value) => ({ id: value, label: value }),
      ...listPresentation(passiveListState),
      onAction: (action) => ({ kind: 'passiveList' as const, action })
    });
    const scrollableList = list({
      id: 'scrollable-list', items: ['one'],
      projectItem: (value) => ({ id: value, label: value }),
      ...listScrollablePresentation(scrollableListState),
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'scrollableList' as const, action })
    });
    const passiveTable = table({
      id: 'passive-table', rows: [{ id: 'one' }], getRowId: (row) => row.id,
      presentation: tablePresentation(passiveTableState),
      onAction: (action) => ({ kind: 'passiveTable' as const, action })
    });
    const scrollableTable = table({
      id: 'scrollable-table', rows: [{ id: 'one' }], getRowId: (row) => row.id,
      presentation: tableScrollablePresentation(scrollableTableState),
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'scrollableTable' as const, action })
    });
    const passiveTree = tree({
      id: 'passive-tree', ...treePresentation(passiveTreeState),
      onAction: (action) => ({ kind: 'passiveTree' as const, action })
    });
    const scrollableTree = tree({
      id: 'scrollable-tree', ...treeScrollablePresentation(scrollableTreeState),
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'scrollableTree' as const, action })
    });
    const passiveLog = scrollback({
      id: 'passive-log', ...scrollbackPresentation([], passiveScrollbackState),
      onAction: (action) => ({ kind: 'passiveLog' as const, action })
    });
    const scrollableLog = scrollback({
      id: 'scrollable-log', ...scrollbackScrollablePresentation([], scrollableScrollbackState),
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'scrollableLog' as const, action })
    });

    type _PassiveList = Assert<Equal<MessageOf<typeof passiveList>, { readonly kind: 'passiveList'; readonly action: ListControlAction }>>;
    type _ScrollableList = Assert<Equal<MessageOf<typeof scrollableList>, { readonly kind: 'scrollableList'; readonly action: ListAction }>>;
    type _PassiveTable = Assert<Equal<MessageOf<typeof passiveTable>, { readonly kind: 'passiveTable'; readonly action: TableControlAction }>>;
    type _ScrollableTable = Assert<Equal<MessageOf<typeof scrollableTable>, { readonly kind: 'scrollableTable'; readonly action: TableAction }>>;
    type _PassiveTree = Assert<Equal<MessageOf<typeof passiveTree>, { readonly kind: 'passiveTree'; readonly action: TreeControlAction }>>;
    type _ScrollableTree = Assert<Equal<MessageOf<typeof scrollableTree>, { readonly kind: 'scrollableTree'; readonly action: TreeInteractionAction }>>;
    type _PassiveLog = Assert<Equal<MessageOf<typeof passiveLog>, { readonly kind: 'passiveLog'; readonly action: ScrollbackControlAction }>>;
    type _ScrollableLog = Assert<Equal<MessageOf<typeof scrollableLog>, { readonly kind: 'scrollableLog'; readonly action: ScrollbackAction }>>;

    declare const textAreaControlAction: TextAreaControlAction;
    void textAreaControlAction;
  `, { name: 'behavior-presentation-variants' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('multi-channel components infer unions without explicit message arguments', () => {
  const diagnostics = typecheckSource(`
    import {
      commandInput,
      palette,
      textArea,
      tree,
      type CommandInputAction,
      type Element,
      type PaletteAction,
      type TextAreaAction,
      type TreeAction
    } from '@ismail-elkorchi/terminal-ui/components';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const explorer = tree({
      id: 'explorer',
      nodes: [{ id: 'src', label: 'src', kind: 'leaf' }],
      onAction: (action: TreeAction) => ({
        kind: 'tree' as const,
        action
      }),
      keys: { enter: () => ({ kind: 'activate' as const }) }
    });

    const editor = textArea({
      id: 'editor',
      presentation: { value: 'hello', cursor: 0 },
      onAction: (action: TextAreaAction) => ({ kind: 'editor' as const, action })
    });

    const commands = commandInput({
      id: 'commands',
      presentation: { value: '', cursor: 0, suggestions: [] },
      onAction: (action: CommandInputAction) => ({ kind: 'command' as const, action }),
      onSubmit: () => ({ kind: 'submit' as const }),
      keys: {
        arrowUp: () => ({ kind: 'history' as const, delta: -1 as const }),
        escape: () => ({ kind: 'close' as const })
      }
    });

    const search = palette({
      id: 'search',
      entries: [{ id: 'open', label: 'Open', value: 1 }],
      onSelect: (entry) => ({ kind: 'selectEntry' as const, value: entry.value }),
      onAction: (action: PaletteAction) => ({ kind: 'palette' as const, action }),
      keys: {
        enter: () => ({ kind: 'acceptPalette' as const }),
        escape: () => ({ kind: 'closePalette' as const })
      }
    });

    type TreeMessage =
      | { readonly kind: 'tree'; readonly action: TreeAction }
      | { readonly kind: 'activate' };
    type EditorMessage = { readonly kind: 'editor'; readonly action: TextAreaAction };
    type CommandMessage =
      | { readonly kind: 'command'; readonly action: CommandInputAction }
      | { readonly kind: 'submit' }
      | { readonly kind: 'history'; readonly delta: -1 }
      | { readonly kind: 'close' };
    type PaletteMessage =
      | { readonly kind: 'selectEntry'; readonly value: number }
      | { readonly kind: 'palette'; readonly action: PaletteAction }
      | { readonly kind: 'acceptPalette' }
      | { readonly kind: 'closePalette' };

    type _TreeActual = Assert<MessageOf<typeof explorer> extends TreeMessage ? true : false>;
    type _TreeExpected = Assert<TreeMessage extends MessageOf<typeof explorer> ? true : false>;
    type _EditorActual = Assert<MessageOf<typeof editor> extends EditorMessage ? true : false>;
    type _EditorExpected = Assert<EditorMessage extends MessageOf<typeof editor> ? true : false>;
    type _CommandActual = Assert<MessageOf<typeof commands> extends CommandMessage ? true : false>;
    type _CommandExpected = Assert<CommandMessage extends MessageOf<typeof commands> ? true : false>;
    type _PaletteActual = Assert<MessageOf<typeof search> extends PaletteMessage ? true : false>;
    type _PaletteExpected = Assert<PaletteMessage extends MessageOf<typeof search> ? true : false>;
  `, { name: 'multi-channel-component-inference' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('prompt kinds preserve result values and reject contradictory policies', () => {
  const diagnostics = typecheckSource(`
    import { progress, runPrompt, select } from '@ismail-elkorchi/terminal-ui/prompts';

    const selected = await runPrompt(select({
      label: 'Port',
      choices: [{ label: 'HTTPS', value: 443 }],
      nonTty: { mode: 'provided_value', value: 443 }
    }));
    if (selected.status === 'submitted') {
      const port: number = selected.value;
      void port;
    }

    progress({
      label: 'Build',
      progress: { kind: 'indeterminate', status: 'Starting' }
    });

    progress({
      label: 'Build',
      progress: { kind: 'determinate', value: 1, max: 4 }
    });

    select({
      label: 'Invalid',
      choices: [{ label: 'One', value: 1 }],
      // @ts-expect-error reject policies cannot carry a value
      nonTty: { mode: 'reject', value: 1 }
    });

    progress({
      label: 'Invalid',
      // @ts-expect-error indeterminate progress cannot carry determinate metrics
      progress: { kind: 'indeterminate', value: 1, max: 4 }
    });
  `, { name: 'discriminated-prompt-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('TUI transitions are synchronous and asynchronous work uses typed effects and sources', () => {
  const diagnostics = typecheckSource(`
    import { defineTui } from '@ismail-elkorchi/terminal-ui/tui';
    import { text } from '@ismail-elkorchi/terminal-ui/components';

    type Message =
      | { readonly kind: 'load' }
      | { readonly kind: 'loaded'; readonly value: string };

    defineTui<{ readonly value: string }, Message>({
      id: 'typed-effects',
      init: () => ({ value: '' }),
      update: (state, message) => message.kind === 'load'
        ? {
            state,
            effects: [{
              id: 'load-value',
              concurrency: 'replace',
              async run() {
                return {
                  kind: 'message' as const,
                  message: { kind: 'loaded' as const, value: 'ready' }
                };
              }
            }]
          }
        : { state: { value: message.value } },
      subscriptions: () => [{
        id: 'refresh',
        generation: 0,
        delivery: 'latest',
        async *messages() {
          yield { kind: 'loaded' as const, value: 'fresh' };
        }
      }],
      view: (state) => text(state.value)
    });

    defineTui({
      // @ts-expect-error initialization is a synchronous state transition
      init: async () => ({ value: '' }),
      update: (state: { readonly value: string }) => ({ state }),
      view: (state) => text(state.value)
    });

    defineTui({
      init: () => ({ value: '' }),
      // @ts-expect-error updates cannot hold the serialized transition queue with a promise
      update: async (state: { readonly value: string }) => ({ state }),
      view: (state) => text(state.value)
    });

    defineTui({
      init: () => ({ value: '' }),
      update: (state: { readonly value: string }) => ({ state }),
      // @ts-expect-error event sources must declare their backlog semantics
      subscriptions: () => [{
        id: 'missing-delivery',
        generation: 0,
        async *messages() {
          yield { kind: 'loaded' as const, value: 'fresh' };
        }
      }],
      view: (state) => text(state.value)
    });
  `, { name: 'tui-effect-and-source-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});
