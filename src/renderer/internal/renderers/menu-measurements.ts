import { commandInputBlock } from '../command-input.ts';
import { dropdownMenuBlock, menuBarBlock, menuBlock } from '../menu-widgets.ts';
import { measureBlock, zeroMeasurement } from '../measurement.ts';
import { paletteBlock } from '../palette.ts';
import { constrainedMeasureBounds } from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';

export const menuMeasurements = {
  menu: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    menuBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  menuBar: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    menuBarBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  contextMenu: () => zeroMeasurement(),
  dropdownMenu: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    dropdownMenuBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  commandInput: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    commandInputBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  palette: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    paletteBlock(renderNode, constrainedMeasureBounds(bounds).height, theme),
    { widthProfile }
  )
} satisfies RendererMeasurementMap<
  'menu' | 'menuBar' | 'contextMenu' | 'dropdownMenu' | 'commandInput' | 'palette'
>;
