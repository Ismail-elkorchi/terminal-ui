# Custom Widgets

Custom widgets are first-class widget descriptions with explicit renderer
contracts.

Use `custom()` when built-in widgets are not the right shape. A custom renderer
can:

- measure or lay out itself;
- render styled spans through `FrameBuffer`;
- expose accessibility;
- expose focus targets;
- expose hit targets;
- receive caller-owned state.

Custom widgets must not write directly to terminal hosts and must not emit raw
ANSI. Rendering goes through the same buffer, clipping, Unicode-width,
sanitization, diff, and accessibility pipeline as built-in widgets.

Interactive custom widgets must provide accessibility. Pure decoration may opt
into `accessibility: { decorative: true }`, but decorative widgets cannot expose
keyboard, text input, focus, or pointer interaction.

Executable examples:

- `examples/tui/custom-widget.mjs`
- `examples/tui/game-board.mjs`
- `examples/testing/visual-snapshots.mjs`
