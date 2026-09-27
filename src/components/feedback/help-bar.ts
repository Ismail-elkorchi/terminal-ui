import { assertStableIds } from '../../collection/identity.ts';
import type { SemanticLeafComponentFactory } from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { decodeInputTrigger } from '../../input/triggers.ts';
import { formatKeyboardBinding } from '../../interaction/key-binding.ts';
import type { RenderSpan } from '../../visual/render-content.ts';
import { measureRenderSpans, span } from '../../visual/render-content.ts';
import { sanitizeLine, singleLineMeasurement } from '../shared/indicator-helpers.ts';
import type { HelpBarStylePart } from '../style-parts.ts';
import type { HelpGroup } from './help.ts';
import type { HelpBarOptions } from './options.ts';
import type { StatusVisualInput } from './status-paint.ts';
import { fillSpans, statusGap, statusSpan } from './status-paint.ts';

interface HelpBarModel {
  readonly groups: readonly HelpGroupModel[];
}

interface HelpGroupModel {
  readonly id: string;
  readonly label?: string;
  readonly bindings: readonly { readonly key: string; readonly label: string }[];
}

export const helpBar: SemanticLeafComponentFactory<
  Pick<HelpBarOptions, 'groups'>,
  never,
  HelpBarStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
> = defineComponent<Pick<HelpBarOptions, 'groups'>>()({
  name: 'terminal-ui/components/help-bar',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'group',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value'],
  createModel(value) {
    const groups = value.groups.map((group, index) => createHelpGroupModel(group, index));
    assertStableIds(groups, (group) => group.id, 'helpBar');
    return { groups };
  },
  measure(input) {
    return singleLineMeasurement(helpBarMeasureSpans(input.model), input.widthProfile);
  },
  render(input) {
    const spans = fitHelpBarSpans(input, input.bounds.width);
    input.target.write(0, 0, [
      ...spans,
      ...fillSpans(
        input,
        Math.max(
          0,
          input.bounds.width - measureRenderSpans(spans, {
            widthProfile: input.widthProfile,
          }),
        ),
      ),
    ]);
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'group',
      label: 'Keyboard shortcuts',
      children: model.groups.map((group) => ({
        id: `${id}:${group.id}`,
        role: 'group' as const,
        ...(group.label === undefined ? {} : { label: group.label }),
        children: group.bindings.map((binding, index) => ({
          id: `${id}:${group.id}:${String(index)}`,
          role: 'text' as const,
          label: binding.key,
          value: binding.label,
        })),
      })),
    };
  },
});

type HelpBarVisualInput = StatusVisualInput<HelpBarModel, HelpBarStylePart>;

function createHelpGroupModel(value: HelpGroup, index: number): HelpGroupModel {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`helpBar groups[${String(index)}] must be an object.`);
  }
  const id = value.id;
  const label = value.label;
  const bindings = value.bindings;
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError(`helpBar groups[${String(index)}] id must be a non-empty string.`);
  }
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError(`helpBar groups[${String(index)}] label must be a string.`);
  }
  if (!Array.isArray(bindings)) {
    throw new TypeError(`helpBar groups[${String(index)}] bindings must be an array.`);
  }
  return {
    id: sanitizeLine(id),
    ...(label === undefined ? {} : { label: sanitizeLine(label) }),
    bindings: bindings.map((binding, bindingIndex) => {
      if (
        !isNonArrayObject(binding) ||
        typeof binding['label'] !== 'string'
      ) {
        throw new TypeError(
          `helpBar groups[${String(index)}].bindings[${
            String(bindingIndex)
          }] must contain a typed binding and string label.`,
        );
      }
      const trigger = decodeInputTrigger(binding['binding']);
      if (trigger.kind === 'text' || trigger.kind === 'focus') {
        throw new TypeError('helpBar bindings must use key, codePoint, or physicalKey triggers.');
      }
      return {
        key: formatKeyboardBinding(trigger),
        label: sanitizeLine(binding['label']),
      };
    }),
  };
}

function helpBarSpans(
  input: HelpBarVisualInput,
): readonly RenderSpan[] {
  return input.model.groups.flatMap((group, groupIndex): readonly RenderSpan[] => [
    ...(groupIndex === 0 ? [] : [statusGap(input, `group.${group.id}.separator`)]),
    ...(group.label === undefined ? [] : [
      statusSpan(input, group.label, 'label', `group.${group.id}.label`, { itemId: group.id }),
      statusSpan(input, ' ', 'marker', `group.${group.id}.gap`, { cellRole: 'separator' }),
    ]),
    ...group.bindings.flatMap((binding, bindingIndex): readonly RenderSpan[] => [
      ...(group.label === undefined && bindingIndex === 0 ? [] : [
        statusGap(input, `group.${group.id}.binding.${String(bindingIndex)}.separator`),
      ]),
      statusSpan(
        input,
        binding.key,
        'label',
        `group.${group.id}.binding.${String(bindingIndex)}.key`,
        {
          itemId: group.id,
          base: {
            fg: { kind: 'theme', token: 'keyHint.foreground' },
            bg: { kind: 'theme', token: 'keyHint.background' },
            bold: true,
          },
        },
      ),
      statusSpan(
        input,
        ` ${binding.label}`,
        'value',
        `group.${group.id}.binding.${String(bindingIndex)}.label`,
        {
          itemId: group.id,
        },
      ),
    ]),
  ]);
}

function helpBarMeasureSpans(
  model: HelpBarModel,
): readonly RenderSpan[] {
  return model.groups.flatMap((group, groupIndex): readonly RenderSpan[] => [
    ...(groupIndex === 0 ? [] : [span('  ')]),
    ...(group.label === undefined ? [] : [span(group.label), span(' ')]),
    ...group.bindings.flatMap((binding, bindingIndex): readonly RenderSpan[] => [
      ...(group.label === undefined && bindingIndex === 0 ? [] : [span('  ')]),
      span(binding.key),
      span(` ${binding.label}`),
    ]),
  ]);
}

function fitHelpBarSpans(
  input: HelpBarVisualInput,
  maxCells: number,
): readonly RenderSpan[] {
  if (maxCells <= 0) return [];
  const spans = helpBarSpans(input);
  if (measureRenderSpans(spans, { widthProfile: input.widthProfile }) <= maxCells) return spans;
  const marker = statusSpan(input, '…', 'marker', 'overflow', { cellRole: 'decoration' });
  const markerWidth = measureRenderSpans([marker], { widthProfile: input.widthProfile });
  const fitted: RenderSpan[] = [];
  for (const group of input.model.groups) {
    const groupPrefix = [
      ...(fitted.length === 0 ? [] : [statusGap(input, `group.${group.id}.separator`)]),
      ...(group.label === undefined ? [] : [
        statusSpan(input, group.label, 'label', `group.${group.id}.label`, { itemId: group.id }),
        statusSpan(input, ' ', 'marker', `group.${group.id}.gap`, { cellRole: 'separator' }),
      ]),
    ];
    if (
      measureRenderSpans([...fitted, ...groupPrefix, marker], {
        widthProfile: input.widthProfile,
      }) <= maxCells
    ) {
      fitted.push(...groupPrefix);
    }
    for (let bindingIndex = 0; bindingIndex < group.bindings.length; bindingIndex += 1) {
      const binding = group.bindings[bindingIndex];
      if (binding === undefined) continue;
      const bindingSpans = [
        ...(group.label === undefined && bindingIndex === 0 ? [] : [
          statusGap(input, `group.${group.id}.binding.${String(bindingIndex)}.separator`),
        ]),
        statusSpan(
          input,
          binding.key,
          'label',
          `group.${group.id}.binding.${String(bindingIndex)}.key`,
          {
            itemId: group.id,
            base: {
              fg: { kind: 'theme', token: 'keyHint.foreground' },
              bg: { kind: 'theme', token: 'keyHint.background' },
              bold: true,
            },
          },
        ),
        statusSpan(
          input,
          ` ${binding.label}`,
          'value',
          `group.${group.id}.binding.${String(bindingIndex)}.label`,
          {
            itemId: group.id,
          },
        ),
      ];
      if (
        measureRenderSpans([...fitted, ...bindingSpans, marker], {
          widthProfile: input.widthProfile,
        }) > maxCells
      ) {
        const separator = fitted.length === 0 ? [] : [statusGap(input, 'overflow.separator')];
        return measureRenderSpans([...fitted, ...separator, marker], {
            widthProfile: input.widthProfile,
          }) <= maxCells
          ? [...fitted, ...separator, marker]
          : fitted.length === 0 && markerWidth <= maxCells
          ? [marker]
          : fitted;
      }
      fitted.push(...bindingSpans);
    }
  }
  return fitted;
}
