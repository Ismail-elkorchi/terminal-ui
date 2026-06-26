# Accessibility

Every prompt, shell, widget tree, and TUI frame has an accessible snapshot path.
Snapshots are machine-readable data with roles, labels, values, focus state,
selection state, disabled state, expanded state, checked state, progress state,
diagnostics, and source metadata where the surface can provide them.

Use `toAccessibleSnapshot()` for standalone accessible payloads and the testing
harness `snapshot()` method for rendered surfaces. Prompt and TUI runs return
snapshots in their typed result objects.

Accessible snapshots are designed for assistive tooling, deterministic tests,
and agent inspection. They are data, not terminal control output.
