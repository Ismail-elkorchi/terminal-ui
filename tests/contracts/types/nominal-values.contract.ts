import type { TerminalTheme } from '@ismail-elkorchi/terminal-ui/theme';
import type { RasterImage } from '@ismail-elkorchi/terminal-ui/graphics';
import type { PromptDefinition } from '@ismail-elkorchi/terminal-ui/prompts';
import type { TuiApp } from '@ismail-elkorchi/terminal-ui/tui';
import type { LogHistory } from '@ismail-elkorchi/terminal-ui/behavior';
import type { CollectionInteractionIndex } from '@ismail-elkorchi/terminal-ui/interaction';

// @ts-expect-error canonical themes are created by theme factories
const fakeTheme: TerminalTheme = { name: 'fake', tokens: { colors: {}, symbols: {} } };

// @ts-expect-error raster images are owned resources created by rasterImage()
const fakeImage: RasterImage = {
  width: 1,
  height: 1,
  format: 'rgb8',
  byteLength: 3,
  contentDigest: `raster:sha256:${'0'.repeat(64)}`,
};

// @ts-expect-error prompt definitions are prepared by prompt factories
const fakePrompt: PromptDefinition = { kind: 'input', label: 'Name' };

// @ts-expect-error TUI applications are prepared by defineTui()
const fakeApp: TuiApp<undefined, string> = {
  id: 'fake',
  definition: {
    init: () => undefined,
    update: (state) => ({ state }),
    view: () => { throw new Error('unused'); },
  },
};

// @ts-expect-error log history is prepared by prepareLogHistory()
const fakeHistory: LogHistory = { kind: 'log-history', entryCount: 0 };

// @ts-expect-error collection indexes are prepared and opaque
const fakeIndex: CollectionInteractionIndex = {};

void fakeTheme;
void fakeImage;
void fakePrompt;
void fakeApp;
void fakeHistory;
void fakeIndex;
