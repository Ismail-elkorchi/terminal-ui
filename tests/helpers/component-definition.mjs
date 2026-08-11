import { defineComponent, ignoreMessage, span } from '../../dist/component/index.js';

const unitMeasurement = Object.freeze({
  minWidth: 0,
  minHeight: 0,
  preferredWidth: 1,
  preferredHeight: 1
});

export const leafComponentDefinition = Object.freeze({
  structure: 'leaf',
  identity: 'required',
  name: 'terminal-ui-tests/components/testLeaf',
  parts: Object.freeze([]),
  prepare: (value) => value,
  measure: () => unitMeasurement
});

export const compositeComponentDefinition = Object.freeze({
  structure: 'composite',
  identity: 'required',
  name: 'terminal-ui-tests/components/testComposite',
  parts: Object.freeze([]),
  slots: Object.freeze({
    content: Object.freeze({
      cardinality: 'many',
      owner: 'caller',
      messages: 'bubble'
    })
  }),
  prepare: (value) => value,
  measure: ({ childCount, measureChild }) => {
    const children = Array.from({ length: childCount }, (_unused, index) =>
      measureChild(index)
    );
    return {
      minWidth: Math.max(0, ...children.map((child) => child.minWidth)),
      minHeight: children.reduce((height, child) => height + child.minHeight, 0),
      preferredWidth: Math.max(
        0,
        ...children.map((child) => child.preferredWidth)
      ),
      preferredHeight: children.reduce(
        (height, child) => height + child.preferredHeight,
        0
      )
    };
  }
});

export function componentElement({ definition, children, ...options }) {
  const normalized = {
    semantics: 'semantic',
    ...definition,
    ...(definition.structure === 'composite'
      ? {
          layout: (input) => ({
            content: definition.layout.call(undefined, input)
          })
        }
      : {})
  };
  const emitsActions = normalized.hitTargets !== undefined
    || normalized.keys !== undefined
    || normalized.onInput !== undefined
    || normalized.onPaste !== undefined
    || normalized.pointer !== undefined;
  return defineComponent(normalized)({
    ...options,
    ...(definition.structure === 'composite'
      ? { slots: { content: children ?? [] } }
      : {}),
    ...(emitsActions ? { onAction: (action) => action } : {})
  });
}

export function testKeyInput(options) {
  const onAction = options.onAction;
  const definition = defineComponent({
    name: 'terminal-ui-tests/components/key-input',
    identity: 'required',
    structure: 'leaf',
    semantics: 'semantic',
    metadata: ['focus', 'layer', 'styles'],
    prepare(value) {
      if (typeof value.value !== 'string') {
        throw new TypeError('test key input value must be a string.');
      }
      return { value: value.value };
    },
    measure: ({ model }) => ({
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(1, model.value.length),
      preferredHeight: 1
    }),
    render: ({ target, model }) => target.write(0, 0, [span(model.value)]),
    keys: () => options.keys ?? {},
    onInput: ({ text }) => onAction === undefined
      ? ignoreMessage()
      : onAction({ kind: 'edit', operation: { kind: 'insert', text } }),
    onPaste: ({ text }) => onAction === undefined
      ? ignoreMessage()
      : onAction({ kind: 'edit', operation: { kind: 'insert', text } }),
    focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
    accessibility: ({ id, model, focused }) => ({
      id,
      role: 'textbox',
      label: id,
      value: model.value,
      ...(focused ? { focused: true } : {})
    })
  });
  return definition({
    id: options.id,
    value: options.presentation?.value ?? '',
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: (action) => action
  });
}
