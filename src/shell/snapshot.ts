import { toAccessibleSnapshot } from '../accessibility/index.ts';
import type { AccessibleNode, AccessibleSnapshot } from '../accessibility/index.ts';
import type { ShellHelpPreview, ShellOptions, ShellState } from './types.ts';

export function shellSnapshot(id: string, options: ShellOptions, state: ShellState): AccessibleSnapshot {
  return toAccessibleSnapshot({
    source: 'shell',
    root: {
      id,
      role: 'application',
      label: options.accessibility?.label ?? options.title ?? 'Shell',
      children: [
        {
          id: `${id}:input`,
          role: 'textbox',
          label: 'Command input',
          value: state.input.text,
          focused: state.mode !== 'cancelled' && state.mode !== 'exited'
        },
        ...shellTransientNodes(id, state)
      ]
    },
    diagnostics: state.diagnostics
  });
}

function shellTransientNodes(id: string, state: ShellState): readonly AccessibleNode[] {
  const layer = state.transientLayer;
  if (layer === undefined) return [];
  if (layer.kind === 'help') {
    return [helpNode(id, layer.preview)];
  }
  const role = layer.kind === 'palette' ? 'menu' : 'listbox';
  const childRole = layer.kind === 'palette' ? 'menuitem' : 'option';
  return [{
    id: `${id}:${layer.kind}`,
    role,
    label: layer.kind === 'palette' ? 'Command palette' : 'Command suggestions',
    children: state.suggestions.map((suggestion, index) => ({
      id: `${id}:${layer.kind}:${suggestion.id}`,
      role: childRole,
      label: suggestion.label,
      selected: index === layer.selectedIndex,
      ...(suggestion.description === undefined ? {} : { description: suggestion.description })
    }))
  }];
}

function helpNode(id: string, preview: ShellHelpPreview): AccessibleNode {
  const details = [
    preview.usage === undefined ? undefined : `Usage: ${preview.usage}`,
    preview.aliases === undefined || preview.aliases.length === 0 ? undefined : `Aliases: ${preview.aliases.join(', ')}`,
    preview.help
  ].filter((value): value is string => value !== undefined).join('\n');
  return {
    id: `${id}:help`,
    role: 'status',
    label: preview.title,
    ...(preview.description === undefined ? {} : { description: [preview.description, details].filter(Boolean).join('\n') })
  };
}
