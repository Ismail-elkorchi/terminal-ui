# Northstar Control

`Northstar Control` is the flagship executable demo for `terminal-ui`.

It is a real full-screen operations console backed by the public `defineTui`,
`createTuiRuntime`, widget, and memory-host APIs. The scripted entrypoint drives
the same app deterministically for package tests.

```bash
node examples/showcase/app.mjs
node examples/showcase/scripted.mjs
```

The app intentionally demonstrates layout, tabs, overlays, modal focus scopes,
menus, palette, forms, text areas, tables, trees, charts, canvas, scrollback,
structured records, command surfaces, hit targets, accessible snapshots,
render diffs, and deterministic memory-host execution through the real runtime
instead of a one-frame preview path.
