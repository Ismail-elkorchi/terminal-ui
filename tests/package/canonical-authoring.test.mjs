import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTypeDiagnostic, typecheckSource } from './support/typecheck.mjs';

test('canonical component authoring infers semantic and decorative leaf capabilities', () => {
  const diagnostics = typecheckSource(`
    import { defineComponent, type Element } from '@ismail-elkorchi/terminal-ui/component';
    const badge = defineComponent<{ readonly label: string }, { readonly kind: 'activate' }>()({
      name: 'tests/canonical-badge', identity: 'optional', structure: 'leaf', semantics: 'semantic',
      accessibleRole: 'status', parts: ['value'], metadata: ['styles'], visualStates: ['hovered'],
      measure: () => ({ minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: 1 }),
      render: () => undefined,
      accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label })
    });
    const element: Element<'activate'> = badge({ label: 'Ready', onAction: action => action.kind,
      styles: { parts: { value: { bold: true } }, states: { hovered: { parts: { value: { italic: true } } } } }
    });
    // @ts-expect-error unknown anatomy cannot be configured
    badge({ label: 'Ready', onAction: action => action.kind, styles: { parts: { typo: { bold: true } } } });
    // @ts-expect-error action mapping remains required
    badge({ label: 'Ready' });
    const spacer = defineComponent({ name: 'tests/canonical-spacer', identity: 'optional',
      structure: 'leaf', semantics: 'decorative',
      measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 1, preferredHeight: 1 }), render: () => undefined });
    spacer({});
    // @ts-expect-error decorative leaves do not accept action mapping
    spacer({ onAction: () => 'action' });
    void element;
  `);
  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});

test('removed authoring aliases and type-only function reexports are absent from declarations', () => {
  const diagnostics = typecheckSource(`
    // @ts-expect-error use defineComponent for semantic leaves
    import { defineSemanticLeafComponent } from '@ismail-elkorchi/terminal-ui/component';
    // @ts-expect-error use defineComponent for decorative leaves
    import { defineDecorativeLeafComponent } from '@ismail-elkorchi/terminal-ui/component';
    // @ts-expect-error abbreviated definition aliases have no separate contract
    import type { SemanticLeafDefinition, DecorativeLeafDefinition } from '@ismail-elkorchi/terminal-ui/component';
    // @ts-expect-error runtime inspection lives at its focused component entrypoint
    import type { inspectElement } from '@ismail-elkorchi/terminal-ui';
    // @ts-expect-error predicate functions live at their focused component entrypoints
    import type { isNotificationTone, isProcessStatus, isStatusBarStatus, isValidationLevel } from '@ismail-elkorchi/terminal-ui';
  `);
  assert.deepEqual(diagnostics.map(formatTypeDiagnostic), []);
});
