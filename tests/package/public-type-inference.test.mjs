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
    const save = button({ id: 'save', label: 'Save', onPress: { kind: 'save' } as const });
    const quit = button({ id: 'quit', label: 'Quit', onPress: { kind: 'quit', force: true } as const });
    const toolbar = row([passive, save, quit] as const);

    type _Passive = Assert<Equal<MessageOf<typeof passive>, never>>;
    type _Save = Assert<Equal<MessageOf<typeof save>, { readonly kind: 'save' }>>;
    type _Toolbar = Assert<Equal<
      MessageOf<typeof toolbar>,
      { readonly kind: 'save' } | { readonly kind: 'quit'; readonly force: true }
    >>;
  `, { name: 'public-component-inference' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('interactive identity, passive inputs, and component anatomy are enforced by public types', () => {
  const diagnostics = typecheckSource(`
    import { button, rangeSlider, text, textInput } from '@ismail-elkorchi/terminal-ui/components';

    button({ id: 'save', label: 'Save' });
    textInput({
      id: 'query',
      value: 'term',
      meta: {
        styles: {
          parts: { value: { bold: true }, cursor: { underline: true } },
          states: { focused: { bold: true } }
        }
      }
    });

    // @ts-expect-error interactive components require authored identity
    button({ label: 'Save' });
    // @ts-expect-error button interaction state is one discriminated field
    button({ id: 'legacy-button-state', label: 'Save', disabled: true });
    // @ts-expect-error range sliders retain the shared disabled control contract
    rangeSlider({ id: 'invalid-range-state', value: { start: 1, end: 2 }, state: 'disabled' });
    // @ts-expect-error passive text cannot own local input bindings
    text('Passive', { keys: { enter: () => ({ kind: 'invalid' }) } });
    textInput({
      id: 'invalid-style',
      value: '',
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

test('item domains share only valid foundations', () => {
  const diagnostics = typecheckSource(`
    import type {
      ChoiceItem,
      MenuItem,
      SearchEntry,
      SuggestionItem,
      TreeNode
    } from '@ismail-elkorchi/terminal-ui/components';

    const choice: ChoiceItem<number> = { id: 'one', label: 'One', value: 1 };
    const action: MenuItem = { id: 'open', label: 'Open' };
    const suggestion: SuggestionItem = { value: '/open', label: 'Open' };
    const search: SearchEntry<number> = {
      id: 'file', label: 'File', value: 1, keywords: ['open']
    };
    const tree: TreeNode = { id: 'src', label: 'src', kind: 'branch', expanded: true, children: [] };
    void [choice, action, suggestion, search, tree];

    // @ts-expect-error action items do not become values implicitly
    const invalidChoice: ChoiceItem<number> = action;
    void invalidChoice;
  `, { name: 'item-domain-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('frame-only renderer helpers accept heterogeneous authored elements', () => {
  const diagnostics = typecheckSource(`
    import { button, text } from '@ismail-elkorchi/terminal-ui/components';
    import { column } from '@ismail-elkorchi/terminal-ui/layout';
    import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    const content = column([
      text('Actions'),
      button({ id: 'save', label: 'Save', onPress: { kind: 'save' } as const }),
      button({ id: 'quit', label: 'Quit', onPress: { kind: 'quit' } as const })
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
      button({ id: 'save', label: 'Save', onPress: { kind: 'save' } as const }),
      button({ id: 'quit', label: 'Quit', onPress: { kind: 'quit' } as const })
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

test('table rows and explicit cell accessors retain their domain types', () => {
  const diagnostics = typecheckSource(`
    import { table, type Element } from '@ismail-elkorchi/terminal-ui/components';

    interface ProcessRow {
      readonly pid: number;
      readonly name: string;
    }

    const rows: readonly ProcessRow[] = [{ pid: 42, name: 'worker' }];
    const processes = table({
    getRowId: (row) => String(row.pid),
    id: 'processes',
      rows,
      columns: [
        { id: 'pid', header: 'PID', value: (row) => row.pid },
        { id: 'name', header: 'Name', value: (row) => row.name }
      ],
      selectedRowId: '42',
      selectedCell: { rowId: '42', column: 1 },
      onAction: (action) => ({
        kind: 'selected' as const,
        action
      })
    });

    const accepted: Element<{
      readonly kind: 'selected';
      readonly action: import('@ismail-elkorchi/terminal-ui/components').TableAction;
    }> = processes;
    void accepted;
  `, { name: 'typed-table-contract' });

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
      type TreeAction
    } from '@ismail-elkorchi/terminal-ui/components';
    import type { ScrollEvent } from '@ismail-elkorchi/terminal-ui/behavior';
    import type { TextEditOperation } from '@ismail-elkorchi/terminal-ui/text';

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
      value: 'hello',
      onScroll: (event: ScrollEvent) => ({ kind: 'scroll' as const, event }),
      onEdit: (operation: TextEditOperation) => ({ kind: 'edit' as const, operation })
    });

    const commands = commandInput({
      id: 'commands',
      onAction: (action: CommandInputAction) => ({ kind: 'command' as const, action }),
      onSubmit: { kind: 'submit' as const },
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
    type EditorMessage =
      | { readonly kind: 'scroll'; readonly event: ScrollEvent }
      | { readonly kind: 'edit'; readonly operation: TextEditOperation };
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
        async *messages() {
          yield { kind: 'loaded' as const, value: 'fresh' };
        }
      }],
      view: (state) => text(state.value)
    });
  `, { name: 'tui-effect-and-source-contracts' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});
