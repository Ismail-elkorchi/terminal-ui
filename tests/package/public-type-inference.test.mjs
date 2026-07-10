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
    const save = button({ label: 'Save', onPress: { kind: 'save' } as const });
    const quit = button({ label: 'Quit', onPress: { kind: 'quit', force: true } as const });
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

test('frame-only renderer helpers accept heterogeneous authored elements', () => {
  const diagnostics = typecheckSource(`
    import { button, text } from '@ismail-elkorchi/terminal-ui/components';
    import { stack } from '@ismail-elkorchi/terminal-ui/layout';
    import { renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

    const content = stack([
      text('Actions'),
      button({ label: 'Save', onPress: { kind: 'save' } as const }),
      button({ label: 'Quit', onPress: { kind: 'quit' } as const })
    ] as const);

    renderElementFrame(content, { columns: 20, rows: 4 });
  `, { name: 'renderer-authored-element-boundary' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('passive container options preserve child message unions', () => {
  const diagnostics = typecheckSource(`
    import { button, type Element } from '@ismail-elkorchi/terminal-ui/components';
    import { overlay, row, stack, surface } from '@ismail-elkorchi/terminal-ui/layout';

    type Message =
      | { readonly kind: 'save' }
      | { readonly kind: 'quit' };

    const actions = row([
      button({ label: 'Save', onPress: { kind: 'save' } as const }),
      button({ label: 'Quit', onPress: { kind: 'quit' } as const })
    ] as const, { id: 'actions', gap: 1 });
    const panel = surface(stack([actions], { id: 'content' }), {
      id: 'panel',
      variant: 'raised'
    });
    const root = overlay([panel], { id: 'root' });
    const accepted: Element<Message> = root;
    void accepted;
  `, { name: 'passive-container-message-inference' });

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
      rows,
      columns: [
        { id: 'pid', header: 'PID', value: (row) => row.pid },
        { id: 'name', header: 'Name', value: (row) => row.name }
      ],
      selected: 0,
      selectedCell: { row: 0, column: 1 },
      onSelect: (selection) => ({
        kind: 'selected' as const,
        pid: selection.row.pid,
        value: selection.cell?.value
      })
    });

    const accepted: Element<{
      readonly kind: 'selected';
      readonly pid: number;
      readonly value: unknown;
    }> = processes;
    void accepted;
  `, { name: 'typed-table-contract' });

  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('multi-channel components infer unions without explicit message arguments', () => {
  const diagnostics = typecheckSource(`
    import {
      commandBar,
      palette,
      textArea,
      tree,
      type CommandBarAction,
      type Element,
      type PaletteAction,
      type TreeDisclosureAction
    } from '@ismail-elkorchi/terminal-ui/components';
    import type { ScrollEvent } from '@ismail-elkorchi/terminal-ui/behavior';
    import type { TextEditOperation } from '@ismail-elkorchi/terminal-ui/text';

    type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
    type Equal<TLeft, TRight> =
      (<T>() => T extends TLeft ? 1 : 2) extends
      (<T>() => T extends TRight ? 1 : 2) ? true : false;
    type Assert<TValue extends true> = TValue;

    const explorer = tree({
      nodes: [{ id: 'src', label: 'src' }],
      onSelect: (node) => ({ kind: 'select' as const, id: node.id }),
      onDisclosure: (_node, action: TreeDisclosureAction) => ({
        kind: 'disclose' as const,
        action
      }),
      keys: { enter: { kind: 'activate' as const } }
    });

    const editor = textArea({
      value: 'hello',
      onScroll: (event: ScrollEvent) => ({ kind: 'scroll' as const, event }),
      onEdit: (operation: TextEditOperation) => ({ kind: 'edit' as const, operation }),
      onInput: (text) => ({ kind: 'input' as const, text })
    });

    const commands = commandBar({
      onAction: (action: CommandBarAction) => ({ kind: 'command' as const, action }),
      onSubmit: { kind: 'submit' as const },
      keys: { escape: { kind: 'close' as const } }
    });

    const search = palette({
      entries: [{ id: 'open', label: 'Open', value: 1 }],
      onSelect: (entry) => ({ kind: 'selectEntry' as const, value: entry.value }),
      onAction: (action: PaletteAction) => ({ kind: 'palette' as const, action }),
      keys: { escape: { kind: 'closePalette' as const } }
    });

    type TreeMessage =
      | { readonly kind: 'select'; readonly id: string }
      | { readonly kind: 'disclose'; readonly action: TreeDisclosureAction }
      | { readonly kind: 'activate' };
    type EditorMessage =
      | { readonly kind: 'scroll'; readonly event: ScrollEvent }
      | { readonly kind: 'edit'; readonly operation: TextEditOperation }
      | { readonly kind: 'input'; readonly text: string };
    type CommandMessage =
      | { readonly kind: 'command'; readonly action: CommandBarAction }
      | { readonly kind: 'submit' }
      | { readonly kind: 'close' };
    type PaletteMessage =
      | { readonly kind: 'selectEntry'; readonly value: number }
      | { readonly kind: 'palette'; readonly action: PaletteAction }
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
              async run() {
                return { kind: 'loaded' as const, value: 'ready' };
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
