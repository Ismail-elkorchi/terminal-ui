# Accessibility

Every prompt, authored element tree, and TUI frame has an accessible snapshot path.
Snapshots are machine-readable data with roles, labels, values, focus state,
selection state, disabled state, expanded state, checked state, progress state,
diagnostics, and source metadata where the surface can provide them.

Form controls, switches, sliders, numeric inputs, grids, trees, grouped
controls, and navigation controls use their established accessibility roles
and required parent-child relationships. Numeric controls expose current,
minimum, maximum, and indeterminate values where their role permits them.
Snapshot validation rejects unknown fields, fields that are invalid for a
role, and invalid direct-child roles.

Positions exposed to accessibility consumers are positive and one-based:
`itemNumber`, `rowNumber`, `columnNumber`, and `level`. Their corresponding
counts are `itemCount`, `rowCount`, and `columnCount`.

Collection windows use zero-based `startIndex` values and exclusive
`endIndexExclusive` values. `totalCount`, `omittedBefore`, and `omittedAfter`
describe the full collection. A visible item at internal index 0 therefore has
accessibility item number 1.

Use `toAccessibleSnapshot()` for standalone accessible payloads and the testing
harness `snapshot()` method for rendered surfaces. Prompt and TUI runs return
snapshots in their typed result objects.

The snapshot source is `prompt`, `tui`, `renderer`, `progress`, or
`test_harness`. Direct renderer output uses `renderer`; snapshots captured
during a TUI run use `tui`; and an empty memory or PTY harness uses
`test_harness` with a group root.

Accessible snapshots are designed for assistive tooling, deterministic tests,
and agent inspection. They are data, not terminal control output.
