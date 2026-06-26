# Migration Notes

`terminal-ui` is not a drop-in compatibility layer for other prompt or TUI
libraries.

Migration usually means mapping product interaction requirements onto these
stable primitives:

- terminal host adapters;
- typed input events;
- prompt definitions and typed prompt results;
- `cli-core` backed shell command sources;
- pure widget data;
- frames and render diffs;
- accessible snapshots;
- transcripts and replay.

Keep command semantics in `cli-core`; keep terminal interaction in
`terminal-ui`.
