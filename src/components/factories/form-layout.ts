import {
  clipRenderSpans,
  defineComponent,
  measureConstrainedBox,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentLayoutInput,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { Element, ElementChildrenMessage } from '../../element/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { FieldOptions, FormOptions, LabelOptions } from '../options/forms.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { FieldStylePart, LabelStylePart } from '../style-parts.ts';
import type { LayoutFlowOptions, Rect } from '../../geometry/types.ts';
import { layoutContentBounds, decodeLayoutFlowOptions, splitTracks } from '../../layout/index.ts';

interface FormModel {
  readonly title: string;
  readonly layout: LayoutFlowOptions;
}

type FormOwnOptions = LayoutFlowOptions & Pick<FormOptions, 'title'>;

type FormFactory = <
  const TContent extends readonly Element<ComponentMessage>[] = readonly Element<ComponentMessage>[],
>(options: FormOptions<TContent>) => Element<ElementChildrenMessage<TContent>>;

const formSlots = {
  content: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

export const form: FormFactory = defineComponent<
  FormOwnOptions,
  FormModel,
  never,
  'title',
  readonly [],
  'optional',
  readonly ['styles', 'layer'],
  typeof formSlots
>({
  name: 'terminal-ui/components/form',
  identity: 'optional',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'form',
  slots: formSlots,
  metadata: ['styles', 'layer'],
  parts: ['title'],
  createModel: createFormModel,
  measure(input) {
    const titleWidth =
      measureTextCells(input.model.title, { widthProfile: input.widthProfile }).cells;
    const count = input.slots.count('content');
    const measurements = Array.from(
      { length: count },
      (_unused, index) => input.slots.measure('content', index),
    );
    const gap = input.model.layout.gap ?? 0;
    const titleRows = input.model.title.length === 0 ? 0 : 1;
    return measureConstrainedBox({
      minWidth: Math.max(titleWidth, ...measurements.map((item) => item.minWidth), 0),
      minHeight: titleRows + measurements.reduce((height, item) => height + item.minHeight, 0) +
        Math.max(0, count - 1) * gap,
      preferredWidth: Math.max(titleWidth, ...measurements.map((item) => item.preferredWidth), 0) +
        0,
      preferredHeight: titleRows +
        measurements.reduce((height, item) => height + item.preferredHeight, 0) +
        Math.max(0, count - 1) * gap,
    }, input.model.layout);
  },
  layout(input) {
    const content = formContentBounds(input);
    const count = input.slots.count('content');
    return {
      content: splitTracks(
        content,
        'vertical',
        Array.from({ length: count }, () => ({ kind: 'content' as const })),
        input.model.layout.gap === undefined ? {} : { gap: input.model.layout.gap },
        Array.from(
          { length: count },
          (_unused, index) => input.slots.measure('content', index).preferredHeight,
        ),
      ),
    };
  },
  renderBeforeChildren(input) {
    if (input.model.title.length === 0) return;
    const content = layoutContentBounds(input.bounds, input.model.layout);
    const style = input.style({
      part: 'title',
      base: { fg: { kind: 'theme', token: 'text.strong' }, bold: true },
    });
    input.target.write(content.row, content.column, [{
      text: input.model.title,
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        partName: 'title',
        partType: 'title',
        cellRole: 'content',
        description: 'form.title',
      }),
    }]);
  },
  accessibility(input) {
    return {
      id: input.id,
      role: 'form',
      ...(input.model.title === '' ? {} : { label: input.model.title }),
      ...(input.focused ? { focused: true } : {}),
      children: input.slots.content,
    };
  },
});

function formContentBounds(input: ComponentLayoutInput<FormModel, typeof formSlots>): Rect {
  const content = layoutContentBounds(input.bounds, input.model.layout);
  const titleRows = input.model.title.length === 0 ? 0 : 1;
  return {
    row: content.row + titleRows,
    column: content.column,
    width: content.width,
    height: Math.max(0, content.height - titleRows),
  };
}

function createFormModel(value: Readonly<FormOwnOptions>): FormModel {
  const title = value.title;
  if (title !== undefined && typeof title !== 'string') {
    throw new TypeError('form title must be a string when provided.');
  }
  return {
    title: title === undefined ? '' : sanitizeTerminalText(title).text,
    layout: decodeLayoutFlowOptions(value, 'form'),
  };
}

interface FieldModel {
  readonly label: string;
  readonly description: string;
  readonly layout: LayoutFlowOptions;
}

const fieldSlots = {
  control: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
} as const;

type FieldFactory = <TChild extends Element<ComponentMessage>>(
  options: FieldOptions<TChild>,
) => Element<import('../../element/index.ts').ElementMessage<TChild>>;

const instantiateField = defineComponent<
  { readonly label: string; readonly description?: string } & LayoutFlowOptions,
  FieldModel,
  never,
  FieldStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer'],
  typeof fieldSlots
>({
  name: 'terminal-ui/components/field',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots: fieldSlots,
  metadata: ['styles', 'layer'],
  parts: ['label', 'description'],
  createModel(value) {
    const label = value.label;
    const description = value.description;
    if (typeof label !== 'string') throw new TypeError('field label must be a string.');
    if (description !== undefined && typeof description !== 'string') {
      throw new TypeError('field description must be a string.');
    }
    return {
      label: sanitizeTerminalText(label).text,
      description: description === undefined ? '' : sanitizeTerminalText(description).text,
      layout: decodeLayoutFlowOptions(value, 'field'),
    };
  },
  measure(input) {
    const header = fieldHeader(input.model);
    const width = Math.max(
      ...header.map((entry) => measureTextCells(entry, { widthProfile: input.widthProfile }).cells),
      input.slots.measure('control').preferredWidth,
      0,
    );
    const height = header.length + input.slots.measure('control').preferredHeight;
    const control = input.slots.measure('control');
    return measureConstrainedBox({
      minWidth: control.minWidth,
      minHeight: header.length + control.minHeight,
      preferredWidth: width,
      preferredHeight: height,
      ...(control.maxWidth === undefined ? {} : { maxWidth: control.maxWidth }),
      ...(control.maxHeight === undefined ? {} : { maxHeight: header.length + control.maxHeight }),
    }, input.model.layout);
  },
  layout(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    const headerRows = fieldHeader(input.model).length;
    const childBounds = {
      row: content.row + Math.min(headerRows, content.height),
      column: content.column,
      width: content.width,
      height: Math.max(0, content.height - headerRows),
    };
    return {
      control: childBounds,
    };
  },
  renderBeforeChildren(input) {
    const content = layoutContentBounds(input.bounds, input.model.layout);
    fieldHeader(input.model).slice(0, content.height).forEach((textValue, row) => {
      const part = row === 0 && input.model.label.length > 0
        ? 'label' as const
        : 'description' as const;
      const style = input.style({
        part,
        ...(part === 'description'
          ? { base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true } }
          : {}),
      });
      input.target.write(
        content.row + row,
        content.column,
        clipRenderSpans(
          [
            span(textValue, {
              ...(style === undefined ? {} : { style }),
              source: input.frameSource({
                partName: `field.${part}`,
                cellRole: 'text',
                description: part === 'label' ? 'field.label.text' : 'field.description',
              }),
            }),
          ],
          content.width,
          { widthProfile: input.widthProfile },
        ),
      );
    });
  },
  accessibility(input) {
    const control = input.slots.control[0];
    if (control === undefined) {
      throw new Error('field accessibility requires its control slot.');
    }
    const labelId = `${input.id}:label`;
    const descriptionId = `${input.id}:description`;
    const describedBy = input.model.description.length === 0
      ? control.describedBy
      : [...(control.describedBy ?? []), descriptionId];
    const relatedControl: AccessibleNode = {
      ...control,
      labelledBy: labelId,
      ...(describedBy === undefined ? {} : { describedBy }),
    };
    return {
      id: input.id,
      role: 'group',
      labelledBy: labelId,
      ...(input.focused ? { focused: true } : {}),
      children: [
        {
          id: labelId,
          role: 'text',
          value: input.model.label,
          controls: control.id,
        },
        ...(input.model.description.length === 0 ? [] : [{
          id: descriptionId,
          role: 'text' as const,
          value: input.model.description,
        }]),
        relatedControl,
      ],
    };
  },
});

export const field: FieldFactory = (options) => {
  const { control, ...rest } = options;
  return instantiateField({ ...rest, slots: { control } });
};

function fieldHeader(model: FieldModel): readonly string[] {
  return [
    ...(model.label.length === 0 ? [] : [model.label]),
    ...(model.description.length === 0 ? [] : [model.description]),
  ];
}

interface LabelModel {
  readonly text: string;
  readonly forId: string;
}

export const label: SemanticLeafComponentFactory<
  Pick<LabelOptions, 'text' | 'forId'>,
  never,
  LabelStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<LabelOptions, 'text' | 'forId'>,
  LabelModel,
  never,
  LabelStylePart,
  readonly [],
  'required',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/label',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  metadata: ['styles', 'layer'],
  parts: ['label'],
  createModel(value) {
    const textValue = value.text;
    const forId = value.forId;
    if (typeof textValue !== 'string') throw new TypeError('label text must be a string.');
    if (typeof forId !== 'string' || forId.trim().length === 0) {
      throw new TypeError('label forId must be a non-empty string.');
    }
    return {
      text: sanitizeTerminalText(textValue).text,
      forId: sanitizeTerminalText(forId).text,
    };
  },
  measure({ model, widthProfile }) {
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: measureTextCells(model.text, { widthProfile }).cells,
      preferredHeight: 1,
    };
  },
  render(input) {
    const style = input.style({ part: 'label' });
    input.target.write(
      0,
      0,
      clipRenderSpans(
        [span(input.model.text, {
          ...(style === undefined ? {} : { style }),
          source: input.frameSource({ partName: 'label.text', cellRole: 'text' }),
        })],
        input.bounds.width,
        { widthProfile: input.widthProfile },
      ),
    );
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'text',
      ...(model.text === '' ? {} : { label: model.text }),
      controls: model.forId,
    };
  },
});
