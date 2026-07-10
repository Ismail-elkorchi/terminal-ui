import type {
  AccessibleNodeDefinition,
  ButtonOptions,
  AbsoluteOptions,
  CanvasOptions,
  CheckboxOptions,
  CheckboxListOptions,
  ColorPickerOptions,
  DatePickerOptions,
  FieldOptions,
  FormOptions,
  ListOptions,
  LabelOptions,
  ContextMenuOptions,
  DropdownOptions,
  DividerOptions,
  TooltipOptions,
  MenuBarOptions,
  MenuItem,
  MenuOptions,
  NotificationStackOptions,
  NumberInputOptions,
  ProgressBarOptions,
  RadioGroupOptions,
  RangeSliderOptions,
  RowOptions,
  ScrollbackOptions,
  SelectBoxOptions,
  SurfaceOptions,
  OverlayOptions,
  SpinnerOptions,
  StackOptions,
  StructuredBlockOptions,
  StatusBarOptions,
  TableOptions,
  TextInputOptions,
  TextOptions,
  SliderOptions,
  ToggleSwitchOptions,
  ViewportOptions,
  ActivityFeedOptions,
  CommandBarOptions,
  GridAreasOptions,
  GridOptions,
  GaugeOptions,
  HelpBarOptions,
  HeatmapOptions,
  ModalOptions,
  PaletteOptions,
  PaginatorOptions,
  RichTextOptions,
  SparklineOptions,
  SplitPaneOptions,
  TextAreaOptions,
  TabsOptions,
  TreeOptions,
  ActivityIndicatorOptions,
  BarChartOptions,
  ChartOptions,
  ComponentFocusOptions,
  ComponentKeyBindings,
  ComponentLayerOptions,
  ComponentMeta,
  ComponentStyleSlots
} from './types.ts';
import { assertCanvasPainter } from './extension-validation.ts';
import type { Element, ElementChildren } from './element.ts';
import { elementFromRenderNode, toRenderNode, toRenderNodes } from '../render-node/element.ts';
import type { RenderNode } from '../render-node/index.ts';
import type { CommandBarAction } from './command-bar.ts';
import type { PaletteAction } from './palette.ts';

export function text(content: string, options: TextOptions = {}): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'text',
    props: {
      content,
      ...(options.textRole === undefined ? {} : { textRole: options.textRole })
    },
    ...interactionOptions(options)
  });
}

export function richText<TMessage>(options: RichTextOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'richText',
    props: {
      segments: options.segments,
      ...(options.wrap === undefined ? {} : { wrap: options.wrap })
    },
    ...interactionOptions(options)
  });
}

export function stack<TMessage>(children: ElementChildren<TMessage>, options: StackOptions<TMessage> = {}): Element<TMessage> {
  const childList = widgetChildren(children);
  assertSizeTrackCount('stack', options.sizes, childList.length);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'stack',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: childList,
    ...interactionOptions(options)
  });
}

export function row<TMessage>(children: ElementChildren<TMessage>, options: RowOptions<TMessage> = {}): Element<TMessage> {
  const childList = widgetChildren(children);
  assertSizeTrackCount('row', options.sizes, childList.length);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'row',
    props: {
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: childList,
    ...interactionOptions(options)
  });
}

export function list<TValue, TMessage>(options: ListOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = listKeyMap(options);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'list',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function table<TMessage>(options: TableOptions<TMessage>): Element<TMessage> {
  const keyMap = tableKeyMap(options, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'table',
    props: {
      rows: options.rows,
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedCell === undefined ? {} : { selectedCell: options.selectedCell }),
      ...(options.density === undefined ? {} : { density: options.density }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.stickyHeader === undefined ? {} : { stickyHeader: options.stickyHeader }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function tree<TMessage>(options: TreeOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'tree',
    props: {
      nodes: options.nodes,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect }),
      ...(options.onDisclosure === undefined ? {} : { toDisclosureMessage: options.onDisclosure })
    },
    ...interactionOptions(options)
  });
}

export function paginator<TMessage>(options: PaginatorOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'paginator',
    props: {
      page: options.page,
      pageCount: options.pageCount,
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionOptions(options)
  });
}

export function textArea<TMessage>(options: TextAreaOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'textArea',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.highlights === undefined ? {} : { highlights: options.highlights }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
      ...(options.activeLine === undefined ? {} : { activeLine: options.activeLine }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer })
    },
    ...interactionOptions(options)
  });
}

export function form<TMessage>(children: ElementChildren<TMessage>, options: FormOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'form',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...layoutProps(options)
    },
    children: widgetChildren(children),
    ...interactionOptions(options)
  });
}

export function field<TMessage>(children: ElementChildren<TMessage>, options: FieldOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
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
    children: widgetChildren(children),
    ...interactionOptions(options)
  });
}

export function label<TMessage>(options: LabelOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'label',
    props: {
      text: options.text,
      ...(options.forId === undefined ? {} : { forId: options.forId }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled })
    },
    ...interactionOptions(options)
  });
}

export function button<TMessage>(options: ButtonOptions<TMessage>): Element<TMessage> {
  const keyMap = messageKeyMap(options.onPress, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'button',
    props: {
      label: options.label,
      ...(options.onPress === undefined ? {} : { message: options.onPress }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.pressed === undefined ? {} : { pressed: options.pressed }),
      ...(options.pending === undefined ? {} : { pending: options.pending })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function checkbox<TMessage>(options: CheckboxOptions<TMessage>): Element<TMessage> {
  const changeMessage = options.onChange?.(!options.checked);
  const keyMap = messageKeyMap(changeMessage, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'checkbox',
    props: {
      label: options.label,
      checked: options.checked,
      ...(changeMessage === undefined ? {} : { message: changeMessage }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function toggleSwitch<TMessage>(options: ToggleSwitchOptions<TMessage>): Element<TMessage> {
  const changeMessage = options.onChange?.(!options.checked);
  const keyMap = messageKeyMap(changeMessage, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'toggleSwitch',
    props: {
      label: options.label,
      checked: options.checked,
      ...(options.onLabel === undefined ? {} : { onLabel: options.onLabel }),
      ...(options.offLabel === undefined ? {} : { offLabel: options.offLabel }),
      ...(changeMessage === undefined ? {} : { message: changeMessage }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function slider<TMessage>(options: SliderOptions<TMessage>): Element<TMessage> {
  const keyMap = sliderKeyMap(options, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'slider',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function rangeSlider<TMessage>(options: RangeSliderOptions<TMessage>): Element<TMessage> {
  const keyMap = rangeSliderKeyMap(options, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'rangeSlider',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      start: options.start,
      end: options.end,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function checkboxList<TValue, TMessage>(options: CheckboxListOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'checkboxList',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  });
}

export function radioGroup<TValue, TMessage>(options: RadioGroupOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'radioGroup',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  });
}

export function colorPicker<TValue, TMessage>(options: ColorPickerOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'colorPicker',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  });
}

export function datePicker<TValue, TMessage>(options: DatePickerOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'datePicker',
    props: {
      days: options.days,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  });
}

export function selectBox<TValue, TMessage>(options: SelectBoxOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'selectBox',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionOptions(options)
  });
}

export function textInput<TMessage>(options: TextInputOptions<TMessage> = {}): Element<TMessage> {
  const keyMap = messageKeyMap(options.onSubmit, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'textInput',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onSubmit === undefined ? {} : { message: options.onSubmit }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({
      onInput: options.onInput,
      onPaste: options.onPaste,
      meta: options.meta
    })
  });
}

export function numberInput<TMessage>(options: NumberInputOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
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
  });
}

export function menu<TMessage>(options: MenuOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keys);
  const items = menuItemsForRenderer(options.items);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'menu',
    props: {
      items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function menuBar<TMessage>(options: MenuBarOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keys);
  const items = menuItemsForRenderer(options.items);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'menuBar',
    props: {
      items,
      ...(options.selected === undefined ? {} : { selected: options.selected })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function contextMenu<TMessage>(options: ContextMenuOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keys);
  const items = menuItemsForRenderer(options.items);
  const meta = withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } });
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'contextMenu',
    props: {
      items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta })
  });
}

export function dropdown<TMessage>(options: DropdownOptions<TMessage>): Element<TMessage> {
  const keyMap = menuKeyMap(options.items, options.selected, options.keys);
  const items = menuItemsForRenderer(options.items);
  const meta = options.open === true
    ? withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } })
    : options.meta;
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'dropdown',
    props: {
      items,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.open === undefined ? {} : { open: options.open }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta })
  });
}

export function divider<TMessage>(options: DividerOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'divider',
    props: {
      ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
      ...(options.line === undefined ? {} : { line: options.line }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.labelAlign === undefined ? {} : { labelAlign: options.labelAlign })
    },
    ...interactionOptions({
      keys: options.keys,
      meta: options.meta
    })
  });
}

export function tooltip<TMessage>(options: TooltipOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'tooltip',
    props: {
      content: options.content,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.border === undefined ? {} : { border: options.border })
    },
    ...interactionOptions({
      keys: options.keys,
      meta: options.meta
    })
  });
}

export function notificationStack<TMessage>(options: NotificationStackOptions<TMessage>): Element<TMessage> {
  const meta = withMetaDefaults(options.meta, { focus: { disabled: true } });
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'notificationStack',
    props: {
      items: options.items,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.onDismiss === undefined ? {} : { toDismissMessage: options.onDismiss })
    },
    ...interactionOptions({ keys: options.keys, meta })
  });
}

export function canvas<TMessage>(options: CanvasOptions<TMessage>): Element<TMessage> {
  assertCanvasPainter(options.painter);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'canvas',
    props: {
      painter: options.painter,
      ...(options.state === undefined ? {} : { state: options.state }),
      ...(options.label === undefined ? {} : { label: options.label })
    },
    ...interactionOptions(options)
  });
}

export function surface<TMessage>(child: Element<TMessage>, options: SurfaceOptions<TMessage> = {}): Element<TMessage> {
  assertSingleSurfaceChild(child);
  const childNode = toRenderNode(child);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'surface',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.visualState === undefined ? {} : { visualState: options.visualState }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.shadow === undefined ? {} : { shadow: options.shadow }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...surfaceLayoutProps(options)
    },
    children: [childNode],
    ...interactionOptions(options)
  });
}

export function absolute<TMessage>(child: Element<TMessage>, options: AbsoluteOptions<TMessage>): Element<TMessage> {
  const childNode = toRenderNode(child);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'absolute',
    props: {
      row: options.row,
      column: options.column,
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height })
    },
    children: [childNode],
    ...interactionOptions(options)
  });
}

export function overlay<TMessage>(children: ElementChildren<TMessage>, options: OverlayOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'overlay',
    props: {},
    children: widgetChildren(children),
    ...interactionOptions(options)
  });
}

export function statusBar<TMessage>(options: StatusBarOptions<TMessage>): Element<TMessage> {
  const keyMap = messageKeyMap(options.onPress, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'statusBar',
    props: { text: options.text },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionOptions({ meta: options.meta })
  });
}

export function helpBar<TMessage>(options: HelpBarOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'helpBar',
    props: { bindings: options.bindings },
    ...interactionOptions(options)
  });
}

export function activityIndicator(options: ActivityIndicatorOptions = {}): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'activityIndicator',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionOptions(options)
  });
}

export function progressBar(options: ProgressBarOptions): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'progressBar',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.indeterminate === undefined ? {} : { indeterminate: options.indeterminate }),
      ...(options.barWidth === undefined ? {} : { barWidth: options.barWidth }),
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(options.labelPosition === undefined ? {} : { labelPosition: options.labelPosition }),
      ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
      ...(options.remainingMs === undefined ? {} : { remainingMs: options.remainingMs }),
      ...(options.frame === undefined ? {} : { frame: options.frame }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale })
    },
    ...interactionOptions(options)
  });
}

export function sparkline(options: SparklineOptions): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'sparkline',
    props: {
      values: options.values,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText })
    },
    ...interactionOptions(options)
  });
}

export function barChart<TMessage>(options: BarChartOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'barChart',
    props: {
      items: options.items,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText })
    },
    ...interactionOptions(options)
  });
}

export function chart<TMessage>(options: ChartOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'chart',
    props: {
      series: options.series,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.legend === undefined ? {} : { legend: options.legend }),
      ...(options.signedDomain === undefined ? {} : { signedDomain: options.signedDomain }),
      ...(options.xLabel === undefined ? {} : { xLabel: options.xLabel }),
      ...(options.yLabel === undefined ? {} : { yLabel: options.yLabel }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.sampleMode === undefined ? {} : { sampleMode: options.sampleMode }),
      ...(options.sampleAlign === undefined ? {} : { sampleAlign: options.sampleAlign }),
      ...(options.interpolation === undefined ? {} : { interpolation: options.interpolation }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...interactionOptions(options)
  });
}

export function gauge(options: GaugeOptions): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'gauge',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.variant === undefined ? {} : { variant: options.variant }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionOptions(options)
  });
}

export function heatmap<TValue, TMessage>(options: HeatmapOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'heatmap',
    props: {
      rows: options.rows,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.cellWidth === undefined ? {} : { cellWidth: options.cellWidth }),
      ...(options.gap === undefined ? {} : { gap: options.gap }),
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.valueScale === undefined ? {} : { valueScale: options.valueScale }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText }),
      ...(options.loadingText === undefined ? {} : { loadingText: options.loadingText }),
      ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect })
    },
    ...interactionOptions(options)
  });
}

export function spinner(options: SpinnerOptions = {}): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'spinner',
    props: {
      ...(options.frames === undefined ? {} : { frames: options.frames }),
      ...(options.frameIndex === undefined ? {} : { frameIndex: options.frameIndex }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.status === undefined ? {} : { status: options.status })
    },
    ...interactionOptions(options)
  });
}

export function viewport<TMessage>(child: Element<TMessage>, options: ViewportOptions<TMessage> = {}): Element<TMessage> {
  const childNode = toRenderNode(child);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'viewport',
    props: {
      ...(options.scrollRow === undefined ? {} : { scrollRow: options.scrollRow }),
      ...(options.scrollColumn === undefined ? {} : { scrollColumn: options.scrollColumn }),
      ...(options.contentRows === undefined ? {} : { contentRows: options.contentRows }),
      ...(options.contentColumns === undefined ? {} : { contentColumns: options.contentColumns }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...layoutProps(options)
    },
    children: [childNode],
    ...interactionOptions(options)
  });
}

export function scrollback<TMessage>(options: ScrollbackOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'scrollback',
    props: {
      items: options.items,
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.searchQuery === undefined ? {} : { searchQuery: options.searchQuery }),
      ...(options.selectedRange === undefined ? {} : { selectedRange: options.selectedRange })
    },
    ...interactionOptions(options)
  });
}

export function structuredBlock<TMessage>(options: StructuredBlockOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
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
  });
}

export function activityFeed<TMessage>(options: ActivityFeedOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'activityFeed',
    props: {
      blocks: options.blocks,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onSelect === undefined ? {} : {
        toSelectMessage: (index: number) => {
          const block = options.blocks[index];
          return block === undefined ? undefined : options.onSelect?.(block, index);
        }
      })
    },
    ...interactionOptions(options)
  });
}

export function commandBar<TMessage>(options: CommandBarOptions<TMessage> = {}): Element<TMessage> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : commandBarActionKeyMap(action);
  const submitKeys = options.onSubmit === undefined ? undefined : { enter: options.onSubmit };
  const keyMap = mergeKeyMaps(mergeKeyMaps(generatedKeys, submitKeys), options.keys);
  return elementFromRenderNode({
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
      ...(options.historyIndex === undefined ? {} : { historyIndex: options.historyIndex }),
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer })
    },
    ...interactionOptions({
      ...(action === undefined ? {} : {
        onInput: (text) => action({ kind: 'insert', text }),
        onPaste: (text) => action({ kind: 'insert', text })
      }),
      ...(keyMap === undefined ? {} : { keys: keyMap }),
      meta: options.meta
    })
  });
}

export function palette<TValue, TMessage>(options: PaletteOptions<TValue, TMessage>): Element<TMessage> {
  const action = options.onAction;
  const generatedKeys = action === undefined ? undefined : paletteActionKeyMap(action);
  const keyMap = mergeKeyMaps(generatedKeys, options.keys);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'palette',
    props: {
      entries: options.entries,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.onSelect === undefined ? {} : { toMessage: options.onSelect }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.selectedId === undefined ? {} : { selectedId: options.selectedId }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.maxVisible === undefined ? {} : { maxVisible: options.maxVisible }),
      ...(options.helpText === undefined ? {} : { helpText: options.helpText }),
      ...(options.emptyText === undefined ? {} : { emptyText: options.emptyText })
    },
    ...interactionOptions({
      ...(action === undefined ? {} : {
        onInput: (text) => action({ kind: 'insertQuery', text }),
        onPaste: (text) => action({ kind: 'insertQuery', text })
      }),
      ...(keyMap === undefined ? {} : { keys: keyMap }),
      meta: options.meta
    })
  });
}

export function grid<TMessage>(
  children: ElementChildren<TMessage>,
  options: GridOptions<TMessage>
): Element<TMessage>;
export function grid<TMessage>(
  options: GridAreasOptions<TMessage>
): Element<TMessage>;
export function grid<TMessage>(
  childrenOrOptions: ElementChildren<TMessage> | GridAreasOptions<TMessage>,
  options?: GridOptions<TMessage>
): Element<TMessage> {
  if (options !== undefined) {
    const childList = widgetChildren(childrenOrOptions as ElementChildren<TMessage>);
    return elementFromRenderNode({
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
      children: childList,
      ...interactionOptions(options)
    });
  }

  const areaOptions = childrenOrOptions as GridAreasOptions<TMessage>;
  const template = parseGridAreasTemplate(areaOptions.areas);
  const areaNames = gridAreaNames(template);
  assertGridAreaChildren(areaNames, areaOptions.children);
  if (areaOptions.rows.length !== template.length) {
    throw new RangeError(`grid areas rows length ${String(areaOptions.rows.length)} must match template rows ${String(template.length)}.`);
  }
  if (template[0] !== undefined && areaOptions.columns.length !== template[0].length) {
    throw new RangeError(`grid areas columns length ${String(areaOptions.columns.length)} must match template columns ${String(template[0].length)}.`);
  }
  return elementFromRenderNode({
    ...optionalId(areaOptions.id),
    kind: 'grid',
    props: {
      areas: template,
      areaNames,
      rows: areaOptions.rows,
      columns: areaOptions.columns,
      ...(areaOptions.gap === undefined ? {} : { gap: areaOptions.gap }),
      ...(areaOptions.rowGap === undefined ? {} : { rowGap: areaOptions.rowGap }),
      ...(areaOptions.columnGap === undefined ? {} : { columnGap: areaOptions.columnGap }),
      ...layoutProps(areaOptions)
    },
    children: toRenderNodes(areaNames.map((name) => areaOptions.children[name]).filter((child): child is Element<TMessage> => child !== undefined)),
    ...interactionOptions(areaOptions)
  });
}

export function splitPane<TMessage>(
  children: ElementChildren<TMessage>,
  options: SplitPaneOptions<TMessage>
): Element<TMessage> {
  const childList = widgetChildren(children);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'splitPane',
    props: {
      direction: options.direction,
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: childList,
    ...interactionOptions(options)
  });
}

export function tabs<TMessage>(options: TabsOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'tabs',
    props: {
      tabs: options.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        ...(tab.description === undefined ? {} : { description: tab.description }),
        ...(tab.disabled === undefined ? {} : { disabled: tab.disabled }),
        ...(tab.onSelect === undefined ? {} : { message: tab.onSelect }),
        ...(tab.badge === undefined ? {} : { badge: tab.badge }),
        ...(tab.onClose === undefined ? {} : { closeMessage: tab.onClose })
      })),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...layoutProps(options)
    },
    children: options.tabs.map((tab) => toRenderNode(tab.panel)),
    ...interactionOptions(options)
  });
}

export function modal<TMessage>(
  child: Element<TMessage>,
  options: ModalOptions<TMessage> = {}
): Element<TMessage> {
  const meta = withMetaDefaults(options.meta, {
    focus: { scope: 'contain' },
    layer: { opacity: 'opaque' }
  });
  const childNode = toRenderNode(child);
  const actionsNode = options.actions === undefined ? undefined : toRenderNode(options.actions);
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'modal',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...layoutProps(options)
    },
    children: actionsNode === undefined ? [childNode] : [childNode, actionsNode],
    ...interactionOptions({ ...options, meta })
  });
}

function widgetChildren<TMessage>(children: ElementChildren<TMessage>): readonly RenderNode<TMessage>[] {
  return toRenderNodes(children);
}

function assertSizeTrackCount(kind: 'row' | 'stack', sizes: readonly unknown[] | undefined, childCount: number): void {
  if (sizes !== undefined && sizes.length !== childCount) {
    throw new RangeError(`${kind} sizes length ${String(sizes.length)} must match child count ${String(childCount)}.`);
  }
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
}): RenderNode['props'] {
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

function surfaceLayoutProps(options: {
  readonly padding?: unknown;
  readonly margin?: unknown;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: unknown;
  readonly justify?: unknown;
  readonly overflow?: unknown;
}): RenderNode['props'] {
  return {
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

function assertSingleSurfaceChild<TMessage>(child: Element<TMessage>): void {
  if (Array.isArray(child)) {
    throw new Error('surface() expects exactly one non-surface child. Compose child content with stack(), row(), grid(), or tabs() before wrapping it in surface().');
  }
  const childNode = toRenderNode(child);
  if (childNode.kind === 'surface') {
    throw new Error('surface() expects exactly one non-surface child. Compose child content with stack(), row(), grid(), or tabs() before wrapping it in surface().');
  }
}

function parseGridAreasTemplate(source: string): readonly (readonly string[])[] {
  const rows = source
    .trim()
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => row.split(/\s+/u));
  if (rows.length === 0) throw new RangeError('grid areas must contain at least one row.');
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new RangeError('grid areas must contain at least one column.');
  for (const row of rows) {
    if (row.length !== width) throw new RangeError('grid areas must be rectangular.');
    for (const name of row) {
      if (name !== '.' && !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(name)) {
        throw new RangeError(`grid area name "${name}" is invalid.`);
      }
    }
  }
  assertGridAreaTemplateRectangles(rows);
  return rows;
}

function gridAreaNames(template: readonly (readonly string[])[]): readonly string[] {
  const names: string[] = [];
  for (const row of template) {
    for (const name of row) {
      if (name === '.' || names.includes(name)) continue;
      names.push(name);
    }
  }
  return names;
}

function assertGridAreaChildren(
  areaNames: readonly string[],
  children: Readonly<Record<string, Element>>
): void {
  const names = new Set(areaNames);
  for (const name of areaNames) {
    if (children[name] === undefined) throw new RangeError(`grid is missing child for area "${name}".`);
  }
  for (const name of Object.keys(children)) {
    if (!names.has(name)) throw new RangeError(`grid child "${name}" is not used by the template.`);
  }
}

function assertGridAreaTemplateRectangles(template: readonly (readonly string[])[]): void {
  for (const name of gridAreaNames(template)) {
    const cells = template.flatMap((row, rowIndex) =>
      row.map((value, columnIndex) => ({ value, rowIndex, columnIndex })).filter((cell) => cell.value === name)
    );
    const minRow = Math.min(...cells.map((cell) => cell.rowIndex));
    const maxRow = Math.max(...cells.map((cell) => cell.rowIndex));
    const minColumn = Math.min(...cells.map((cell) => cell.columnIndex));
    const maxColumn = Math.max(...cells.map((cell) => cell.columnIndex));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        if (template[row]?.[column] !== name) {
          throw new RangeError(`grid area "${name}" must be rectangular.`);
        }
      }
    }
  }
}

function listKeyMap<TValue, TMessage>(
  options: ListOptions<TValue, TMessage>
): ComponentKeyBindings<TMessage> | undefined {
  const selectedItem = options.selected === undefined ? undefined : options.items[options.selected];
  const enterMessage = selectedItem === undefined || options.onSelect === undefined
    ? undefined
    : options.onSelect(selectedItem);
  return mergeKeyMaps(
    enterMessage === undefined ? undefined : { enter: enterMessage },
    options.keys
  );
}

function tableKeyMap<TMessage>(
  options: TableOptions<TMessage>,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const selectedRow = options.selected === undefined ? undefined : options.rows[options.selected];
  const enterMessage = selectedRow === undefined || options.selected === undefined || options.onSelect === undefined
    ? undefined
    : options.onSelect({
        row: selectedRow,
        rowIndex: options.selected,
        ...(options.selectedCell?.column === undefined
          ? {}
          : {
              cell: {
                value: rowCellValue(selectedRow, options.columns?.[options.selectedCell.column], options.selectedCell.column),
                columnIndex: options.selectedCell.column,
                sourceColumnIndex: options.selectedCell.column,
                columnLabel: options.columns?.[options.selectedCell.column]?.header ?? `Column ${String(options.selectedCell.column + 1)}`
              }
            })
      });
  return mergeKeyMaps(enterMessage === undefined ? undefined : { enter: enterMessage }, explicit);
}

function rowCellValue(row: unknown, column: { readonly header?: string } | undefined, columnIndex: number): unknown {
  if (row === null || typeof row !== 'object') return row;
  if (column?.header !== undefined && column.header in row) return (row as Record<string, unknown>)[column.header];
  const values = Array.isArray(row) ? row : Object.values(row);
  return values[columnIndex];
}

function messageKeyMap<TMessage>(
  message: TMessage | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  return mergeKeyMaps(message === undefined ? undefined : { enter: message }, explicit);
}

function commandBarActionKeyMap<TMessage>(
  onAction: (action: CommandBarAction) => TMessage
): ComponentKeyBindings<TMessage> {
  return {
    backspace: onAction({ kind: 'deleteBackward' }),
    delete: onAction({ kind: 'deleteForward' }),
    arrowLeft: onAction({ kind: 'moveLeft' }),
    arrowRight: onAction({ kind: 'moveRight' }),
    home: onAction({ kind: 'moveHome' }),
    end: onAction({ kind: 'moveEnd' })
  };
}

function paletteActionKeyMap<TMessage>(
  onAction: (action: PaletteAction) => TMessage
): ComponentKeyBindings<TMessage> {
  return {
    backspace: onAction({ kind: 'deleteQueryBackward' }),
    arrowUp: onAction({ kind: 'moveSelection', delta: -1 }),
    arrowDown: onAction({ kind: 'moveSelection', delta: 1 })
  };
}

function sliderKeyMap<TMessage>(
  options: SliderOptions<TMessage>,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const step = options.step ?? 1;
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const decrement = options.onStep?.({ direction: 'decrement' })
    ?? options.onChange?.(Math.max(min, options.value - step));
  const increment = options.onStep?.({ direction: 'increment' })
    ?? options.onChange?.(Math.min(max, options.value + step));
  return mergeKeyMaps({
    ...(decrement === undefined ? {} : { left: decrement, down: decrement }),
    ...(increment === undefined ? {} : { right: increment, up: increment })
  }, explicit);
}

function rangeSliderKeyMap<TMessage>(
  options: RangeSliderOptions<TMessage>,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const step = options.step ?? 1;
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const decrementStart = options.onStep?.({ handle: 'start', direction: 'decrement' })
    ?? options.onChange?.({ start: Math.max(min, options.start - step), end: options.end });
  const incrementStart = options.onStep?.({ handle: 'start', direction: 'increment' })
    ?? options.onChange?.({ start: Math.min(options.end, options.start + step), end: options.end });
  const decrementEnd = options.onStep?.({ handle: 'end', direction: 'decrement' })
    ?? options.onChange?.({ start: options.start, end: Math.max(options.start, options.end - step) });
  const incrementEnd = options.onStep?.({ handle: 'end', direction: 'increment' })
    ?? options.onChange?.({ start: options.start, end: Math.min(max, options.end + step) });
  return mergeKeyMaps({
    ...(decrementStart === undefined ? {} : { left: decrementStart }),
    ...(incrementStart === undefined ? {} : { right: incrementStart }),
    ...(decrementEnd === undefined ? {} : { down: decrementEnd }),
    ...(incrementEnd === undefined ? {} : { up: incrementEnd })
  }, explicit);
}

function menuKeyMap<TMessage>(
  items: readonly MenuItem<TMessage>[],
  selected: string | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
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
  return item?.disabled === true ? undefined : item?.onPress;
}

function menuItemsForRenderer<TMessage>(items: readonly MenuItem<TMessage>[]): readonly Record<string, unknown>[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.shortcut === undefined ? {} : { shortcut: item.shortcut }),
    ...(item.tone === undefined ? {} : { tone: item.tone }),
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.expanded === undefined ? {} : { expanded: item.expanded }),
    ...(item.onPress === undefined ? {} : { message: item.onPress }),
    ...(item.children === undefined ? {} : { children: menuItemsForRenderer(item.children) })
  }));
}

function visibleMenuItems<TMessage>(items: readonly MenuItem<TMessage>[]): readonly MenuItem<TMessage>[] {
  return items.flatMap((item): readonly MenuItem<TMessage>[] => [
    item,
    ...(item.expanded === true && item.children !== undefined ? visibleMenuItems(item.children) : [])
  ]);
}

function mergeKeyMaps<TMessage>(
  generated: ComponentKeyBindings<TMessage> | undefined,
  explicit: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  const merged = { ...(generated ?? {}), ...(explicit ?? {}) };
  return Object.keys(merged).length === 0 ? undefined : merged;
}

function interactionOptions<TMessage>(
  options: {
    readonly keys?: ComponentKeyBindings<TMessage> | undefined;
    readonly onInput?: ((text: string) => TMessage) | undefined;
    readonly onPaste?: ((text: string) => TMessage) | undefined;
    readonly meta?: ComponentMeta | undefined;
  }
): {
  readonly layer?: ComponentLayerOptions;
  readonly focus?: ComponentFocusOptions;
  readonly styles?: ComponentStyleSlots;
  readonly keyMap?: ComponentKeyBindings<TMessage>;
  readonly inputMap?: NonNullable<RenderNode<TMessage>['inputMap']>;
  readonly accessibility?: AccessibleNodeDefinition;
} {
  const keyMap = normalizedKeyMap(options.keys);
  const inputMap = inputMapFromHandlers(options);
  return {
    ...componentLayer(options.meta),
    ...componentFocus(options.meta),
    ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...(inputMap === undefined ? {} : { inputMap }),
    ...(options.meta?.accessibility === undefined ? {} : { accessibility: options.meta.accessibility })
  };
}

function inputMapFromHandlers<TMessage>(
  options: {
    readonly onInput?: ((text: string) => TMessage) | undefined;
    readonly onPaste?: ((text: string) => TMessage) | undefined;
  }
): NonNullable<RenderNode<TMessage>['inputMap']> | undefined {
  const text = options.onInput;
  const paste = options.onPaste;
  if (text === undefined && paste === undefined) return undefined;
  return {
    ...(text === undefined ? {} : { text }),
    ...(paste === undefined ? {} : { paste })
  };
}

function normalizedKeyMap<TMessage>(
  keyMap: ComponentKeyBindings<TMessage> | undefined
): ComponentKeyBindings<TMessage> | undefined {
  return keyMap === undefined || Object.keys(keyMap).length === 0 ? undefined : keyMap;
}

function componentLayer(meta: ComponentMeta | undefined): { readonly layer?: ComponentLayerOptions } {
  return meta?.layer === undefined ? {} : { layer: meta.layer };
}

function componentFocus(meta: ComponentMeta | undefined): { readonly focus?: ComponentFocusOptions } {
  return meta?.focus === undefined ? {} : { focus: meta.focus };
}

function withMetaDefaults(meta: ComponentMeta | undefined, defaults: ComponentMeta): ComponentMeta {
  const accessibility = meta?.accessibility ?? defaults.accessibility;
  const focus = mergeObject(defaults.focus, meta?.focus);
  const layer = mergeObject(defaults.layer, meta?.layer);
  const styles = mergeObject(defaults.styles, meta?.styles);
  return compactMeta({
    ...(accessibility === undefined ? {} : { accessibility }),
    ...(focus === undefined ? {} : { focus }),
    ...(layer === undefined ? {} : { layer }),
    ...(styles === undefined ? {} : { styles })
  }) ?? {};
}

function compactMeta(meta: ComponentMeta): ComponentMeta | undefined {
  const value: ComponentMeta = {
    ...(meta.accessibility === undefined ? {} : { accessibility: meta.accessibility }),
    ...(meta.focus === undefined ? {} : { focus: meta.focus }),
    ...(meta.layer === undefined ? {} : { layer: meta.layer }),
    ...(meta.styles === undefined ? {} : { styles: meta.styles })
  };
  return Object.keys(value).length === 0 ? undefined : value;
}

function mergeObject<T extends object>(defaults: T | undefined, current: T | undefined): T | undefined {
  if (defaults === undefined && current === undefined) return undefined;
  return {
    ...(defaults ?? {}),
    ...(current ?? {})
  } as T;
}
