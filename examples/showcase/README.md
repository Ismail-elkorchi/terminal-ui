# Northstar Control

`Northstar Control` is the flagship executable demo for `terminal-ui`.

It is a real full-screen operations console backed by the public `defineTui`,
`createTuiRuntime`, widget, snapshot, and memory-host APIs. The scripted and
preview entrypoints make the same app deterministic for package tests and
fixture generation.

```bash
node examples/showcase/app.mjs
node examples/showcase/scripted.mjs
node examples/showcase/preview.mjs
```

The app intentionally demonstrates layout, tabs, overlays, modal focus scopes,
menus, palette, forms, text areas, tables, trees, charts, canvas, scrollback,
structured records, command surfaces, hit targets, accessible snapshots,
render diffs, and deterministic memory-host execution without making the first
screen read like an internal widget catalog.
