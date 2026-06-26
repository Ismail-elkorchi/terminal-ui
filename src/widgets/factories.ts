import type { StyledText } from '../theme/index.ts';
import type {
  AccessibleNodeDefinition,
  BoxWidgetOptions,
  InputFieldWidgetOptions,
  ListWidgetOptions,
  ProgressBarWidgetOptions,
  RowWidgetOptions,
  ScrollbackWidgetOptions,
  SpinnerWidgetOptions,
  StackWidgetOptions,
  StructuredBlockWidgetOptions,
  StatusBarWidgetOptions,
  TableWidgetOptions,
  TextWidgetOptions,
  ViewportWidgetOptions,
  ActivityFeedWidgetOptions,
  Widget,
  WidgetChildren,
  CommandBarWidgetOptions,
  CommandPaletteWidgetOptions,
  GridWidgetOptions,
  HelpBarWidgetOptions,
  ModalWidgetOptions,
  PaginatorWidgetOptions,
  RichTextWidgetOptions,
  SparklineWidgetOptions,
  SplitPaneWidgetOptions,
  TextAreaWidgetOptions,
  TabsWidgetOptions,
  TreeWidgetOptions,
  ActivityIndicatorWidgetOptions,
  BarChartWidgetOptions,
  ChartWidgetOptions,
  WidgetKeyMap,
  WidgetKind,
  WidgetInputMap,
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

export function richText<TMessage>(options: RichTextWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'richText',
    props: {
      segments: options.segments,
      ...(options.wrap === undefined ? {} : { wrap: options.wrap })
    },
    ...interactionOptions(options)
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
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function table<TMessage>(options: TableWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = messageKeyMap(options.message, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'table',
    props: {
      rows: options.rows,
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function tree<TMessage>(options: TreeWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'tree',
    props: {
      nodes: options.nodes,
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    ...interactionOptions(options)
  };
}

export function paginator<TMessage>(options: PaginatorWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'paginator',
    props: {
      page: options.page,
      pageCount: options.pageCount,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionOptions(options)
  };
}

export function inputField<TMessage>(options: InputFieldWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = inputFieldKeyMap(options);
  return {
    ...optionalId(options.id),
    kind: 'inputField',
    props: { value: options.value ?? '' },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ inputMap: options.inputMap, mouseMap: options.mouseMap, accessibility: options.accessibility })
  };
}

export function textArea<TMessage>(options: TextAreaWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'textArea',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder })
    },
    ...interactionOptions(options)
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

export function helpBar<TMessage>(options: HelpBarWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'helpBar',
    props: { bindings: options.bindings },
    ...interactionOptions(options)
  };
}

export function activityIndicator(options: ActivityIndicatorWidgetOptions = {}): Widget<never> {
  return {
    ...optionalId(options.id),
    kind: 'activityIndicator',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionOptions(options)
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

export function sparkline(options: SparklineWidgetOptions): Widget<never> {
  return {
    ...optionalId(options.id),
    kind: 'sparkline',
    props: {
      values: options.values,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max })
    },
    ...interactionOptions(options)
  };
}

export function barChart<TMessage>(options: BarChartWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'barChart',
    props: {
      items: options.items,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    ...interactionOptions(options)
  };
}

export function chart<TMessage>(options: ChartWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'chart',
    props: {
      series: options.series,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max })
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

export function scrollback<TMessage>(options: ScrollbackWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'scrollback',
    props: {
      items: options.items,
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.searchQuery === undefined ? {} : { searchQuery: options.searchQuery }),
      ...(options.selectedRange === undefined ? {} : { selectedRange: options.selectedRange })
    },
    ...interactionOptions(options)
  };
}

export function structuredBlock<TMessage>(options: StructuredBlockWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    id: options.id,
    kind: 'structuredBlock',
    props: {
      title: options.title,
      ...(options.summary === undefined ? {} : { summary: options.summary }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.fields === undefined ? {} : { fields: options.fields }),
      ...(options.body === undefined ? {} : { body: options.body }),
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.collapsed === undefined ? {} : { collapsed: options.collapsed })
    },
    ...interactionOptions(options)
  };
}

export function activityFeed<TMessage>(options: ActivityFeedWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'activityFeed',
    props: {
      blocks: options.blocks,
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    ...interactionOptions(options)
  };
}

export function commandBar<TMessage>(options: CommandBarWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'commandBar',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions }),
      ...(options.selectedSuggestion === undefined ? {} : { selectedSuggestion: options.selectedSuggestion }),
      ...(options.historyIndex === undefined ? {} : { historyIndex: options.historyIndex })
    },
    ...interactionOptions(options)
  };
}

export function commandPalette<TMessage>(options: CommandPaletteWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'commandPalette',
    props: {
      entries: options.entries,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.helpText === undefined ? {} : { helpText: options.helpText })
    },
    ...interactionOptions(options)
  };
}

export function grid<TMessage>(
  children: WidgetChildren<TMessage>,
  options: GridWidgetOptions<TMessage>
): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'grid',
    props: { rows: options.rows, columns: options.columns },
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

export function splitPane<TMessage>(
  children: WidgetChildren<TMessage>,
  options: SplitPaneWidgetOptions<TMessage>
): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'splitPane',
    props: {
      direction: options.direction,
      ...(options.sizes === undefined ? {} : { sizes: options.sizes })
    },
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

export function tabs<TMessage>(options: TabsWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'tabs',
    props: {
      tabs: options.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        ...(tab.disabled === undefined ? {} : { disabled: tab.disabled })
      })),
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    children: options.tabs.map((tab) => tab.panel),
    ...interactionOptions(options)
  };
}

export function modal<TMessage>(
  child: Widget<TMessage>,
  options: ModalWidgetOptions<TMessage> = {}
): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'modal',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height })
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
    readonly inputMap?: WidgetInputMap<TMessage> | undefined;
    readonly mouseMap?: WidgetMouseMap<TMessage> | undefined;
    readonly accessibility?: AccessibleNodeDefinition | undefined;
  }
): {
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly mouseMap?: WidgetMouseMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
} {
  const keyMap = normalizedKeyMap(options.keyMap);
  return {
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(options.inputMap === undefined ? {} : { inputMap: options.inputMap }),
    ...(options.mouseMap === undefined ? {} : { mouseMap: options.mouseMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}

function normalizedKeyMap<TMessage>(
  keyMap: WidgetKeyMap<TMessage> | undefined
): WidgetKeyMap<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}
