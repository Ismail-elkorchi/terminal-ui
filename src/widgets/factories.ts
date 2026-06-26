import type { StyledText } from '../theme/index.ts';
import type {
  AccessibleNodeDefinition,
  BoxWidgetOptions,
  InputFieldWidgetOptions,
  ListWidgetOptions,
  ProgressBarWidgetOptions,
  RowWidgetOptions,
  SpinnerWidgetOptions,
  StackWidgetOptions,
  StatusBarWidgetOptions,
  TableWidgetOptions,
  TextWidgetOptions,
  ViewportWidgetOptions,
  Widget,
  WidgetChildren,
  WidgetKeyMap,
  WidgetKind,
  WidgetMouseMap
} from './types.ts';

export function text(content: string | StyledText, options: TextWidgetOptions = {}): Widget<never> {
  return {
    ...optionalId(options.id),
    kind: 'text',
    props: { content },
    ...interactionOptions(options),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}

export function box<TMessage>(children: WidgetChildren<TMessage>, options: BoxWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return widget('box', children, options);
}

export function stack<TMessage>(children: WidgetChildren<TMessage>, options: StackWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return widget('stack', children, options);
}

export function row<TMessage>(children: WidgetChildren<TMessage>, options: RowWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return widget('row', children, options);
}

export function list<TValue, TMessage>(options: ListWidgetOptions<TValue, TMessage>): Widget<TMessage> {
  const keyMap = listKeyMap(options);
  return {
    ...optionalId(options.id),
    kind: 'list',
    props: { items: options.items, ...(options.selected === undefined ? {} : { selected: options.selected }) },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function table<TMessage>(options: TableWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = messageKeyMap(options.message, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'table',
    props: { rows: options.rows },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function inputField<TMessage>(options: InputFieldWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = inputFieldKeyMap(options);
  return {
    ...optionalId(options.id),
    kind: 'inputField',
    props: { value: options.value ?? '' },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function statusBar<TMessage>(options: StatusBarWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = messageKeyMap(options.message, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'statusBar',
    props: { text: options.text },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function progressBar(options: ProgressBarWidgetOptions): Widget<never> {
  return {
    ...optionalId(options.id),
    kind: 'progressBar',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.indeterminate === undefined ? {} : { indeterminate: options.indeterminate })
    },
    ...interactionOptions(options)
  };
}

export function spinner(options: SpinnerWidgetOptions = {}): Widget<never> {
  return {
    ...optionalId(options.id),
    kind: 'spinner',
    props: options.label === undefined ? {} : { label: options.label },
    ...interactionOptions(options)
  };
}

export function viewport<TMessage>(child: Widget<TMessage>, options: ViewportWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'viewport',
    props: {
      ...(options.scrollRow === undefined ? {} : { scrollRow: options.scrollRow }),
      ...(options.scrollColumn === undefined ? {} : { scrollColumn: options.scrollColumn }),
      ...(options.contentRows === undefined ? {} : { contentRows: options.contentRows }),
      ...(options.contentColumns === undefined ? {} : { contentColumns: options.contentColumns })
    },
    children: [child],
    ...interactionOptions(options)
  };
}

function widget<TMessage>(
  kind: WidgetKind,
  children: WidgetChildren<TMessage>,
  options: {
    readonly id?: string;
    readonly keyMap?: WidgetKeyMap<TMessage>;
    readonly mouseMap?: WidgetMouseMap<TMessage>;
    readonly accessibility?: AccessibleNodeDefinition;
  }
): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind,
    props: {},
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

function optionalId(id: string | undefined): { readonly id?: string } {
  return id === undefined ? {} : { id };
}

function listKeyMap<TValue, TMessage>(
  options: ListWidgetOptions<TValue, TMessage>
): WidgetKeyMap<TMessage> | undefined {
  const selectedItem = options.selected === undefined ? undefined : options.items[options.selected];
  const enterMessage = selectedItem === undefined || options.toMessage === undefined
    ? undefined
    : options.toMessage(selectedItem);
  return mergeKeyMaps(
    enterMessage === undefined ? undefined : { enter: enterMessage },
    options.keyMap
  );
}

function inputFieldKeyMap<TMessage>(
  options: InputFieldWidgetOptions<TMessage>
): WidgetKeyMap<TMessage> | undefined {
  return mergeKeyMaps(
    options.message === undefined ? undefined : { enter: options.message },
    options.keyMap
  );
}

function messageKeyMap<TMessage>(
  message: TMessage | undefined,
  explicit: WidgetKeyMap<TMessage> | undefined
): WidgetKeyMap<TMessage> | undefined {
  return mergeKeyMaps(message === undefined ? undefined : { enter: message }, explicit);
}

function mergeKeyMaps<TMessage>(
  generated: WidgetKeyMap<TMessage> | undefined,
  explicit: WidgetKeyMap<TMessage> | undefined
): WidgetKeyMap<TMessage> | undefined {
  const merged = { ...(generated ?? {}), ...(explicit ?? {}) };
  return Object.keys(merged).length === 0 ? undefined : merged;
}

function interactionOptions<TMessage>(
  options: {
    readonly keyMap?: WidgetKeyMap<TMessage> | undefined;
    readonly mouseMap?: WidgetMouseMap<TMessage> | undefined;
    readonly accessibility?: AccessibleNodeDefinition | undefined;
  }
): {
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
} {
  const keyMap = normalizedKeyMap(options.keyMap);
  return {
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(options.mouseMap === undefined ? {} : { mouseMap: options.mouseMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}

function normalizedKeyMap<TMessage>(
  keyMap: WidgetKeyMap<TMessage> | undefined
): WidgetKeyMap<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}
