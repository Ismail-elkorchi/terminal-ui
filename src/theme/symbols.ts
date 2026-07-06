import { sanitizeTerminalText } from '../text/index.ts';

export interface BorderGlyphSet {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
}

export interface TerminalSymbols {
  readonly borderSingle: BorderGlyphSet;
  readonly borderRounded: BorderGlyphSet;
  readonly treeExpanded: string;
  readonly treeCollapsed: string;
  readonly pointer: string;
  readonly selected: string;
  readonly unselected: string;
  readonly checkboxChecked: string;
  readonly checkboxUnchecked: string;
  readonly radioChecked: string;
  readonly radioUnchecked: string;
  readonly statusError: string;
  readonly statusWarning: string;
  readonly statusInfo: string;
  readonly statusSuccess: string;
  readonly progressFilled: string;
  readonly progressEmpty: string;
  readonly spinnerFrames: readonly string[];
  readonly collapsed: string;
  readonly expanded: string;
  readonly scrollbarVerticalTrack: string;
  readonly scrollbarVerticalThumb: string;
  readonly scrollbarHorizontalTrack: string;
  readonly scrollbarHorizontalThumb: string;
  readonly viewportClipTop: string;
  readonly viewportClipBottom: string;
  readonly viewportClipLeft: string;
  readonly viewportClipRight: string;
  readonly viewportEmpty: string;
}

export interface BorderGlyphSetDefinition {
  readonly topLeft?: string;
  readonly topRight?: string;
  readonly bottomLeft?: string;
  readonly bottomRight?: string;
  readonly horizontal?: string;
  readonly vertical?: string;
}

export interface TerminalSymbolsDefinition {
  readonly borderSingle?: BorderGlyphSetDefinition;
  readonly borderRounded?: BorderGlyphSetDefinition;
  readonly treeExpanded?: string;
  readonly treeCollapsed?: string;
  readonly pointer?: string;
  readonly selected?: string;
  readonly unselected?: string;
  readonly checkboxChecked?: string;
  readonly checkboxUnchecked?: string;
  readonly radioChecked?: string;
  readonly radioUnchecked?: string;
  readonly statusError?: string;
  readonly statusWarning?: string;
  readonly statusInfo?: string;
  readonly statusSuccess?: string;
  readonly progressFilled?: string;
  readonly progressEmpty?: string;
  readonly spinnerFrames?: readonly string[];
  readonly collapsed?: string;
  readonly expanded?: string;
  readonly scrollbarVerticalTrack?: string;
  readonly scrollbarVerticalThumb?: string;
  readonly scrollbarHorizontalTrack?: string;
  readonly scrollbarHorizontalThumb?: string;
  readonly viewportClipTop?: string;
  readonly viewportClipBottom?: string;
  readonly viewportClipLeft?: string;
  readonly viewportClipRight?: string;
  readonly viewportEmpty?: string;
}

export const asciiSymbols: TerminalSymbols = {
  borderSingle: { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' },
  borderRounded: { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' },
  treeExpanded: 'v',
  treeCollapsed: '>',
  pointer: '>',
  selected: '*',
  unselected: ' ',
  checkboxChecked: '[x]',
  checkboxUnchecked: '[ ]',
  radioChecked: '(*)',
  radioUnchecked: '( )',
  statusError: 'x',
  statusWarning: '!',
  statusInfo: 'i',
  statusSuccess: '+',
  progressFilled: '#',
  progressEmpty: '-',
  spinnerFrames: ['-', '\\', '|', '/'],
  collapsed: '[+]',
  expanded: '[-]',
  scrollbarVerticalTrack: '|',
  scrollbarVerticalThumb: '#',
  scrollbarHorizontalTrack: '-',
  scrollbarHorizontalThumb: '#',
  viewportClipTop: '^',
  viewportClipBottom: 'v',
  viewportClipLeft: '<',
  viewportClipRight: '>',
  viewportEmpty: '.'
};

export const unicodeSymbols: TerminalSymbols = {
  borderSingle: { topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', horizontal: '─', vertical: '│' },
  borderRounded: { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', horizontal: '─', vertical: '│' },
  treeExpanded: '▾',
  treeCollapsed: '▸',
  pointer: '›',
  selected: '●',
  unselected: ' ',
  checkboxChecked: '[x]',
  checkboxUnchecked: '[ ]',
  radioChecked: '(*)',
  radioUnchecked: '( )',
  statusError: '×',
  statusWarning: '!',
  statusInfo: 'i',
  statusSuccess: '✓',
  progressFilled: '█',
  progressEmpty: '░',
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  collapsed: '[+]',
  expanded: '[-]',
  scrollbarVerticalTrack: '│',
  scrollbarVerticalThumb: '█',
  scrollbarHorizontalTrack: '─',
  scrollbarHorizontalThumb: '█',
  viewportClipTop: '↑',
  viewportClipBottom: '↓',
  viewportClipLeft: '←',
  viewportClipRight: '→',
  viewportEmpty: '∅'
};

export function mergeSymbols(base: TerminalSymbols, override: TerminalSymbolsDefinition | undefined): TerminalSymbols {
  if (override === undefined) return base;
  return sanitizeSymbols({
    borderSingle: mergeBorder(base.borderSingle, override.borderSingle),
    borderRounded: mergeBorder(base.borderRounded, override.borderRounded),
    treeExpanded: override.treeExpanded ?? base.treeExpanded,
    treeCollapsed: override.treeCollapsed ?? base.treeCollapsed,
    pointer: override.pointer ?? base.pointer,
    selected: override.selected ?? base.selected,
    unselected: override.unselected ?? base.unselected,
    checkboxChecked: override.checkboxChecked ?? base.checkboxChecked,
    checkboxUnchecked: override.checkboxUnchecked ?? base.checkboxUnchecked,
    radioChecked: override.radioChecked ?? base.radioChecked,
    radioUnchecked: override.radioUnchecked ?? base.radioUnchecked,
    statusError: override.statusError ?? base.statusError,
    statusWarning: override.statusWarning ?? base.statusWarning,
    statusInfo: override.statusInfo ?? base.statusInfo,
    statusSuccess: override.statusSuccess ?? base.statusSuccess,
    progressFilled: override.progressFilled ?? base.progressFilled,
    progressEmpty: override.progressEmpty ?? base.progressEmpty,
    spinnerFrames: override.spinnerFrames ?? base.spinnerFrames,
    collapsed: override.collapsed ?? base.collapsed,
    expanded: override.expanded ?? base.expanded,
    scrollbarVerticalTrack: override.scrollbarVerticalTrack ?? base.scrollbarVerticalTrack,
    scrollbarVerticalThumb: override.scrollbarVerticalThumb ?? base.scrollbarVerticalThumb,
    scrollbarHorizontalTrack: override.scrollbarHorizontalTrack ?? base.scrollbarHorizontalTrack,
    scrollbarHorizontalThumb: override.scrollbarHorizontalThumb ?? base.scrollbarHorizontalThumb,
    viewportClipTop: override.viewportClipTop ?? base.viewportClipTop,
    viewportClipBottom: override.viewportClipBottom ?? base.viewportClipBottom,
    viewportClipLeft: override.viewportClipLeft ?? base.viewportClipLeft,
    viewportClipRight: override.viewportClipRight ?? base.viewportClipRight,
    viewportEmpty: override.viewportEmpty ?? base.viewportEmpty
  });
}

export function sanitizeSymbols(symbols: TerminalSymbols): TerminalSymbols {
  return {
    borderSingle: sanitizeBorder(symbols.borderSingle),
    borderRounded: sanitizeBorder(symbols.borderRounded),
    treeExpanded: cleanSymbol(symbols.treeExpanded),
    treeCollapsed: cleanSymbol(symbols.treeCollapsed),
    pointer: cleanSymbol(symbols.pointer),
    selected: cleanSymbol(symbols.selected),
    unselected: cleanSymbol(symbols.unselected),
    checkboxChecked: cleanSymbol(symbols.checkboxChecked),
    checkboxUnchecked: cleanSymbol(symbols.checkboxUnchecked),
    radioChecked: cleanSymbol(symbols.radioChecked),
    radioUnchecked: cleanSymbol(symbols.radioUnchecked),
    statusError: cleanSymbol(symbols.statusError),
    statusWarning: cleanSymbol(symbols.statusWarning),
    statusInfo: cleanSymbol(symbols.statusInfo),
    statusSuccess: cleanSymbol(symbols.statusSuccess),
    progressFilled: cleanSymbol(symbols.progressFilled),
    progressEmpty: cleanSymbol(symbols.progressEmpty),
    spinnerFrames: cleanSymbolList(symbols.spinnerFrames, asciiSymbols.spinnerFrames),
    collapsed: cleanSymbol(symbols.collapsed),
    expanded: cleanSymbol(symbols.expanded),
    scrollbarVerticalTrack: cleanSymbol(symbols.scrollbarVerticalTrack),
    scrollbarVerticalThumb: cleanSymbol(symbols.scrollbarVerticalThumb),
    scrollbarHorizontalTrack: cleanSymbol(symbols.scrollbarHorizontalTrack),
    scrollbarHorizontalThumb: cleanSymbol(symbols.scrollbarHorizontalThumb),
    viewportClipTop: cleanSymbol(symbols.viewportClipTop),
    viewportClipBottom: cleanSymbol(symbols.viewportClipBottom),
    viewportClipLeft: cleanSymbol(symbols.viewportClipLeft),
    viewportClipRight: cleanSymbol(symbols.viewportClipRight),
    viewportEmpty: cleanSymbol(symbols.viewportEmpty)
  };
}

export function symbolEntries(symbols: TerminalSymbols): readonly unknown[] {
  return [
    ['borderSingle', borderEntries(symbols.borderSingle)],
    ['borderRounded', borderEntries(symbols.borderRounded)],
    ['treeExpanded', symbols.treeExpanded],
    ['treeCollapsed', symbols.treeCollapsed],
    ['pointer', symbols.pointer],
    ['selected', symbols.selected],
    ['unselected', symbols.unselected],
    ['checkboxChecked', symbols.checkboxChecked],
    ['checkboxUnchecked', symbols.checkboxUnchecked],
    ['radioChecked', symbols.radioChecked],
    ['radioUnchecked', symbols.radioUnchecked],
    ['statusError', symbols.statusError],
    ['statusWarning', symbols.statusWarning],
    ['statusInfo', symbols.statusInfo],
    ['statusSuccess', symbols.statusSuccess],
    ['progressFilled', symbols.progressFilled],
    ['progressEmpty', symbols.progressEmpty],
    ['spinnerFrames', [...symbols.spinnerFrames]],
    ['collapsed', symbols.collapsed],
    ['expanded', symbols.expanded],
    ['scrollbarVerticalTrack', symbols.scrollbarVerticalTrack],
    ['scrollbarVerticalThumb', symbols.scrollbarVerticalThumb],
    ['scrollbarHorizontalTrack', symbols.scrollbarHorizontalTrack],
    ['scrollbarHorizontalThumb', symbols.scrollbarHorizontalThumb],
    ['viewportClipTop', symbols.viewportClipTop],
    ['viewportClipBottom', symbols.viewportClipBottom],
    ['viewportClipLeft', symbols.viewportClipLeft],
    ['viewportClipRight', symbols.viewportClipRight],
    ['viewportEmpty', symbols.viewportEmpty]
  ];
}

function mergeBorder(base: BorderGlyphSet, override: BorderGlyphSetDefinition | undefined): BorderGlyphSet {
  return {
    topLeft: override?.topLeft ?? base.topLeft,
    topRight: override?.topRight ?? base.topRight,
    bottomLeft: override?.bottomLeft ?? base.bottomLeft,
    bottomRight: override?.bottomRight ?? base.bottomRight,
    horizontal: override?.horizontal ?? base.horizontal,
    vertical: override?.vertical ?? base.vertical
  };
}

function sanitizeBorder(border: BorderGlyphSet): BorderGlyphSet {
  return {
    topLeft: cleanSymbol(border.topLeft),
    topRight: cleanSymbol(border.topRight),
    bottomLeft: cleanSymbol(border.bottomLeft),
    bottomRight: cleanSymbol(border.bottomRight),
    horizontal: cleanSymbol(border.horizontal),
    vertical: cleanSymbol(border.vertical)
  };
}

function borderEntries(border: BorderGlyphSet): readonly unknown[] {
  return [
    ['topLeft', border.topLeft],
    ['topRight', border.topRight],
    ['bottomLeft', border.bottomLeft],
    ['bottomRight', border.bottomRight],
    ['horizontal', border.horizontal],
    ['vertical', border.vertical]
  ];
}

function cleanSymbol(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ') || '?';
}

function cleanSymbolList(values: readonly string[], fallback: readonly string[]): readonly string[] {
  const cleaned = values.map(cleanSymbol).filter((value) => value.length > 0);
  return Object.freeze(cleaned.length === 0 ? [...fallback] : cleaned);
}
