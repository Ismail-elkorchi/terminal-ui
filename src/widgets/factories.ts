import type {
  AccessibleNodeDefinition,
  BoxWidgetOptions,
  ButtonWidgetOptions,
  AbsoluteWidgetOptions,
  CanvasWidgetOptions,
  CheckboxWidgetOptions,
  InputFieldWidgetOptions,
  FieldWidgetOptions,
  FormWidgetOptions,
  ListWidgetOptions,
  LabelWidgetOptions,
  ContextMenuWidgetOptions,
  DropdownWidgetOptions,
  MenuBarWidgetOptions,
  MenuItem,
  MenuWidgetOptions,
  NumberInputWidgetOptions,
  ProgressBarWidgetOptions,
  RadioGroupWidgetOptions,
  RowWidgetOptions,
  ScrollbackWidgetOptions,
  SelectBoxWidgetOptions,
  SurfaceWidgetOptions,
  OverlayWidgetOptions,
  SpinnerWidgetOptions,
  StackWidgetOptions,
  StructuredBlockWidgetOptions,
  StatusBarWidgetOptions,
  TableWidgetOptions,
  TextInputWidgetOptions,
  TextWidgetOptions,
  ViewportWidgetOptions,
  ActivityFeedWidgetOptions,
  Widget,
  WidgetChildren,
  CommandBarWidgetOptions,
  CommandPaletteWidgetOptions,
  CustomWidgetOptions,
  GridWidgetOptions,
  HelpBarWidgetOptions,
  ModalWidgetOptions,
  PaletteWidgetOptions,
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
  WidgetLayerOptions,
  WidgetStyleSlots,
  WidgetInputMap,
  WidgetFocusOptions
} from './types.ts';
import { assertCanvasPainter, assertCustomRenderer } from './extension-validation.ts';

interface WidgetInteractionFields {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly focus?: WidgetFocusOptions;
  readonly styles?: WidgetStyleSlots;
}

export function text(content: string, options: TextWidgetOptions = {}): Widget<never> {
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
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.toMessage === undefined ? {} : { toMessage: options.toMessage })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
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
      ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function tree<TMessage>(options: TreeWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'tree',
    props: {
      nodes: options.nodes,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.toMessage === undefined ? {} : { toMessage: options.toMessage })
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
    props: {
      value: options.value ?? '',
      ...(options.message === undefined ? {} : { message: options.message })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      inputMap: options.inputMap,
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
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
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar })
    },
    ...interactionOptions(options)
  };
}

export function form<TMessage>(children: WidgetChildren<TMessage>, options: FormWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'form',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...layoutProps(options)
    },
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

export function field<TMessage>(children: WidgetChildren<TMessage>, options: FieldWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'field',
    props: {
      label: options.label,
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...layoutProps(options)
    },
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

export function label<TMessage>(options: LabelWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'label',
    props: {
      text: options.text,
      ...(options.forId === undefined ? {} : { forId: options.forId }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled })
    },
    ...interactionOptions(options)
  };
}

export function button<TMessage>(options: ButtonWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = messageKeyMap(options.message, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'button',
    props: {
      label: options.label,
      ...(options.message === undefined ? {} : { message: options.message }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function checkbox<TMessage>(options: CheckboxWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = messageKeyMap(options.message, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'checkbox',
    props: {
      label: options.label,
      checked: options.checked,
      ...(options.message === undefined ? {} : { message: options.message }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function radioGroup<TValue, TMessage>(options: RadioGroupWidgetOptions<TValue, TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'radioGroup',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.toMessage === undefined ? {} : { toMessage: options.toMessage }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  };
}

export function selectBox<TValue, TMessage>(options: SelectBoxWidgetOptions<TValue, TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'selectBox',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.toMessage === undefined ? {} : { toMessage: options.toMessage }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  };
}

export function textInput<TMessage>(options: TextInputWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'textInput',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  };
}

export function numberInput<TMessage>(options: NumberInputWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'numberInput',
    props: {
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  };
}

export function menu<TMessage>(options: MenuWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'menu',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function menuBar<TMessage>(options: MenuBarWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'menuBar',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function contextMenu<TMessage>(options: ContextMenuWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'contextMenu',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function dropdown<TMessage>(options: DropdownWidgetOptions<TMessage>): Widget<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keyMap);
  return {
    ...optionalId(options.id),
    kind: 'dropdown',
    props: {
      items: options.items,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.open === undefined ? {} : { open: options.open }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

export function canvas<TMessage>(options: CanvasWidgetOptions<TMessage>): Widget<TMessage> {
  assertCanvasPainter(options.painter);
  return {
    ...optionalId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      ...(options.state === undefined ? {} : { state: options.state }),
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionOptions(options)
  };
}

export function surface<TMessage>(children: WidgetChildren<TMessage>, options: SurfaceWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'surface',
    props: {
      ...(options.label === undefined ? {} : { label: options.label })
    },
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

export function absolute<TMessage>(child: Widget<TMessage>, options: AbsoluteWidgetOptions<TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'absolute',
    props: {
      row: options.row,
      column: options.column,
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height })
    },
    children: [child],
    ...interactionOptions(options)
  };
}

export function overlay<TMessage>(children: WidgetChildren<TMessage>, options: OverlayWidgetOptions<TMessage> = {}): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'overlay',
    props: {},
    children: Array.isArray(children) ? children : [children],
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
    ...interactionOptions({
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
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
      ...(options.indeterminate === undefined ? {} : { indeterminate: options.indeterminate }),
      ...(options.barWidth === undefined ? {} : { barWidth: options.barWidth }),
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.labelPosition === undefined ? {} : { labelPosition: options.labelPosition }),
      ...(options.showPercentage === undefined ? {} : { showPercentage: options.showPercentage }),
      ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
      ...(options.remainingMs === undefined ? {} : { remainingMs: options.remainingMs }),
      ...(options.frame === undefined ? {} : { frame: options.frame }),
      ...(options.status === undefined ? {} : { status: options.status })
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
    props: {
      ...(options.frames === undefined ? {} : { frames: options.frames }),
      ...(options.frameIndex === undefined ? {} : { frameIndex: options.frameIndex }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
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
      ...(options.contentColumns === undefined ? {} : { contentColumns: options.contentColumns }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...layoutProps(options)
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
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
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
      ...(options.style === undefined ? {} : { style: options.style }),
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
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.completionPreview === undefined ? {} : { completionPreview: options.completionPreview }),
      ...(options.validation === undefined ? {} : { validation: options.validation }),
      ...(options.footer === undefined ? {} : { footer: options.footer }),
      ...(options.matchQuery === undefined ? {} : { matchQuery: options.matchQuery }),
      ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions }),
      ...(options.selectedSuggestion === undefined ? {} : { selectedSuggestion: options.selectedSuggestion }),
      ...(options.historyIndex === undefined ? {} : { historyIndex: options.historyIndex })
    },
    ...interactionOptions(options)
  };
}

export function palette<TValue, TMessage>(options: PaletteWidgetOptions<TValue, TMessage>): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'palette',
    props: {
      entries: options.entries,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.helpText === undefined ? {} : { helpText: options.helpText }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText })
    },
    ...interactionOptions(options)
  };
}

export function commandPalette<TMessage>(options: CommandPaletteWidgetOptions<TMessage>): Widget<TMessage> {
  return palette({
    ...options,
    entries: options.entries.map((entry) => ({
      ...entry,
      value: entry.id
    }))
  });
}

export function grid<TMessage>(
  children: WidgetChildren<TMessage>,
  options: GridWidgetOptions<TMessage>
): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind: 'grid',
    props: {
      rows: options.rows,
      columns: options.columns,
      ...(options.gap === undefined ? {} : { gap: options.gap }),
      ...(options.rowGap === undefined ? {} : { rowGap: options.rowGap }),
      ...(options.columnGap === undefined ? {} : { columnGap: options.columnGap }),
      ...layoutProps(options)
    },
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
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
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
        ...(tab.disabled === undefined ? {} : { disabled: tab.disabled }),
        ...(tab.message === undefined ? {} : { message: tab.message })
      })),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...layoutProps(options)
    },
    children: options.tabs.map((tab) => tab.panel),
    ...interactionOptions(options)
  };
}

export function modal<TMessage>(
  child: Widget<TMessage>,
  options: ModalWidgetOptions<TMessage> = {}
): Widget<TMessage> {
  const focus = options.focus ?? { scope: 'contain' as const };
  return {
    ...optionalId(options.id),
    kind: 'modal',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...layoutProps(options)
    },
    children: [child],
    ...interactionOptions({ ...options, focus, opacity: options.opacity ?? 'opaque' })
  };
}

export function custom<TMessage>(options: CustomWidgetOptions<TMessage>): Widget<TMessage> {
  assertCustomRenderer(options.renderer, {
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility }),
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.inputMap === undefined ? {} : { inputMap: options.inputMap })
  });
  return {
    ...optionalId(options.id),
    kind: 'custom',
    props: {},
    custom: {
      renderer: options.renderer,
      ...(options.state === undefined ? {} : { state: options.state })
    },
    ...interactionOptions({
      keyMap: options.keyMap,
      inputMap: options.inputMap,
      accessibility: options.accessibility,
      ...widgetInteractionFields(options)
    })
  };
}

function widget<TMessage>(
  kind: WidgetKind,
  children: WidgetChildren<TMessage>,
  options: {
    readonly id?: string;
    readonly border?: unknown;
    readonly gap?: number;
    readonly padding?: unknown;
    readonly margin?: unknown;
    readonly minWidth?: number;
    readonly minHeight?: number;
    readonly maxWidth?: number;
    readonly maxHeight?: number;
    readonly align?: unknown;
    readonly justify?: unknown;
    readonly overflow?: unknown;
    readonly keyMap?: WidgetKeyMap<TMessage>;
    readonly accessibility?: AccessibleNodeDefinition;
  } & WidgetLayerOptions
): Widget<TMessage> {
  return {
    ...optionalId(options.id),
    kind,
    props: { ...borderProps(options), ...layoutProps(options) },
    children: Array.isArray(children) ? children : [children],
    ...interactionOptions(options)
  };
}

function borderProps(options: { readonly border?: unknown }): Widget['props'] {
  return options.border === undefined ? {} : { border: options.border };
}

function layoutProps(options: {
  readonly gap?: number;
  readonly padding?: unknown;
  readonly margin?: unknown;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: unknown;
  readonly justify?: unknown;
  readonly overflow?: unknown;
}): Widget['props'] {
  return {
    ...(options.gap === undefined ? {} : { gap: options.gap }),
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.margin === undefined ? {} : { margin: options.margin }),
    ...(options.minWidth === undefined ? {} : { minWidth: options.minWidth }),
    ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.justify === undefined ? {} : { justify: options.justify }),
    ...(options.overflow === undefined ? {} : { overflow: options.overflow })
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

function menuKeyMap<TMessage>(
  items: readonly MenuItem<TMessage>[],
  selected: string | undefined,
  explicit: WidgetKeyMap<TMessage> | undefined
): WidgetKeyMap<TMessage> | undefined {
  const message = selectedMenuMessage(items, selected);
  return messageKeyMap(message, explicit);
}

function selectedMenuMessage<TMessage>(
  items: readonly MenuItem<TMessage>[],
  selected: string | undefined
): TMessage | undefined {
  const visible = visibleMenuItems(items);
  const item = selected === undefined
    ? visible.find((candidate) => candidate.disabled !== true)
    : visible.find((candidate) => candidate.id === selected);
  return item?.disabled === true ? undefined : item?.message;
}

function visibleMenuItems<TMessage>(items: readonly MenuItem<TMessage>[]): readonly MenuItem<TMessage>[] {
  return items.flatMap((item): readonly MenuItem<TMessage>[] => [
    item,
    ...(item.expanded === true && item.children !== undefined ? visibleMenuItems(item.children) : [])
  ]);
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
    readonly accessibility?: AccessibleNodeDefinition | undefined;
  } & WidgetLayerOptions
): {
  readonly layer?: WidgetLayerOptions;
  readonly focus?: WidgetFocusOptions;
  readonly styles?: WidgetStyleSlots;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly inputMap?: WidgetInputMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
} {
  const keyMap = normalizedKeyMap(options.keyMap);
  return {
    ...widgetLayer(options),
    ...widgetFocus(options),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(options.inputMap === undefined ? {} : { inputMap: options.inputMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}

function normalizedKeyMap<TMessage>(
  keyMap: WidgetKeyMap<TMessage> | undefined
): WidgetKeyMap<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}

function widgetLayer(options: WidgetLayerOptions): { readonly layer?: WidgetLayerOptions } {
  const layer = widgetLayerFields(options);
  return Object.keys(layer).length === 0 ? {} : { layer };
}

function widgetLayerFields(options: WidgetLayerOptions): WidgetLayerOptions {
  return {
    ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex }),
    ...(options.visible === undefined ? {} : { visible: options.visible }),
    ...(options.opacity === undefined ? {} : { opacity: options.opacity })
  };
}

function widgetInteractionFields(options: WidgetLayerOptions): WidgetInteractionFields {
  const focus = widgetFocusFields(options);
  return {
    ...widgetLayerFields(options),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(Object.keys(focus).length === 0 ? {} : { focus })
  };
}

function widgetFocus(options: WidgetLayerOptions): { readonly focus?: WidgetFocusOptions } {
  const focus = widgetFocusFields(options);
  return Object.keys(focus).length === 0 ? {} : { focus };
}

function widgetFocusFields(options: WidgetLayerOptions): WidgetFocusOptions {
  return {
    ...(options.focus?.disabled === undefined ? {} : { disabled: options.focus.disabled }),
    ...(options.focus?.order === undefined ? {} : { order: options.focus.order }),
    ...(options.focus?.scope === undefined ? {} : { scope: options.focus.scope })
  };
}
