import { commandInputBlock } from '../command-input.ts';
import { dropdownMenuBlock, menuBarBlock, menuBlock } from '../menu-rendering.ts';
import { measureBlock, zeroMeasurement } from '../measurement.ts';
import { searchPickerBlock } from '../search-picker.ts';
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
  searchPicker: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    searchPickerBlock(renderNode, constrainedMeasureBounds(bounds).height, theme),
    { widthProfile }
  )
} satisfies RendererMeasurementMap<
  'menu' | 'menuBar' | 'contextMenu' | 'dropdownMenu' | 'commandInput' | 'searchPicker'
>;
