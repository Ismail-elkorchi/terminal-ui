import { rgb, themePackDefinition } from './shared.ts';

export const nordThemeDefinition = themePackDefinition('nord', {
  'app.background': rgb(46, 52, 64),
  'app.foreground': rgb(236, 239, 244),
  'surface.background': rgb(59, 66, 82),
  'surface.border': rgb(76, 86, 106),
  'surface.title': rgb(136, 192, 208),
  'text.default': rgb(236, 239, 244),
  'text.muted': rgb(216, 222, 233),
  'accent.primary': rgb(136, 192, 208),
  'accent.secondary': rgb(180, 142, 173),
  'status.info': rgb(129, 161, 193),
  'status.success': rgb(163, 190, 140),
  'status.warning': rgb(235, 203, 139),
  'status.error': rgb(191, 97, 106),
  'selection.background': rgb(67, 76, 94),
  'focus.border': rgb(143, 188, 187),
  'menu.match': rgb(180, 142, 173),
  'chart.series.1': rgb(163, 190, 140),
  'chart.series.2': rgb(136, 192, 208),
  'chart.series.3': rgb(180, 142, 173)
});
