# Accessibility

Every prompt, caller-supplied element tree, and TUI frame has an accessible snapshot path.
Snapshots are machine-readable data with roles, labels, values, focus state,
selection state, disabled, busy, and read-only state, expanded state, checked state, progress state,
diagnostics, and source metadata where the surface can provide them.

Form controls, switches, sliders, numeric inputs, grids, trees, grouped
controls, and navigation controls use their established accessibility roles
and required parent-child relationships. Numeric controls expose current,
minimum, maximum, and indeterminate values where their role permits them.
Snapshot validation rejects unknown fields, fields that are invalid for a
role, and invalid direct-child roles.

Document surfaces can expose `document`, `heading`, `link`, `list`, and
`listitem` nodes. Contextual explanations use the `tooltip` role.
Headings use a positive, one-based `level` where the source has a heading
level, and links expose their accessible label and focus state.

The public snapshot format accepts the standard structures represented by its
declared roles, not only trees emitted by built-in controls. Tables and grids
may contain rows directly or through row groups. Rows may contain cells, grid
cells, column headers, and row headers. List boxes, menus, radio groups, and
trees may use grouping nodes around their required item roles. Built-in table
headers are emitted as column headers. A separate `label()` element creates a
machine-readable `labelledBy` relationship on its target control. Labels and
descriptions caller-supplied directly on built-in controls remain fields on the node
they describe and do not require separate descriptive children.

Tabs expose a group containing a tab list and its tab panels. Each tab names
the panel it controls, each panel is labelled by its tab, and the selected
panel contains the selected tab's accessible child content. Relationship
validation requires referenced nodes to exist in the same snapshot and rejects
self-references or references to the wrong role.

Positions exposed to accessibility consumers are positive and one-based:
`positionInSet`, `rowIndex`, `columnIndex`, and `level`. Their corresponding
counts are `setSize`, `rowCount`, and `columnCount`.

Collection windows use zero-based `startIndex` values and exclusive
`endIndexExclusive` values. `totalCount`, `omittedBefore`, and `omittedAfter`
describe the full collection. A visible item at internal index 0 therefore has
accessibility position in set 1.

Use `createAccessibleSnapshot()` for standalone accessible payloads and the testing
harness `snapshot()` method for rendered surfaces. Prompt and TUI runs return
snapshots in their typed result objects.

The snapshot source is `prompt`, `tui`, `renderer`, `progress`, or
`test_harness`. Direct renderer output uses `renderer`; snapshots captured
during a TUI run use `tui`; and an empty memory or PTY harness uses
`test_harness` with a group root.

Accessible snapshots are designed for assistive tooling, deterministic tests,
and agent inspection. They are data, not terminal control output.

## Readable semantic output

`renderAccessibleSnapshot(snapshot)` projects the same snapshot used by the
renderer and test harness into text. Besides role, name and value it includes:

- Focus, selection, checked/pressed/current state, expansion and orientation
- Required, invalid, disabled, busy and read-only state
- Caret and selection offsets, numeric ranges, collection/text windows and positions
- Resolved label, description, controlled-node, active-descendant and error relationships
- Dialog scope, focus trapping and background-obscuring context

Offsets are zero-based UTF-16 offsets into the exposed value, or absolute offsets
when `textWindow` is present. Collection positions remain one-based. Relationship
IDs remain visible alongside their human-readable text. Terminal control sequences
are sanitized. This is a projection, not a second application state store.

## Interactive accessible mode

Opt in when running the app:

```ts
import { button, defineTui, runTui } from '@ismail-elkorchi/terminal-ui';

const app = defineTui({
  init: () => ({ state: false }),
  update: () => ({ state: true, exit: { reason: 'done' } }),
  view: () => button({ id: 'done', label: 'Done', onPress: () => 'done' }),
});
await runTui(app, { outputMode: 'accessible' });
```

The default is `visual`. Accessible mode uses the existing serialized frame commit
and host write receipt as its only output owner. It appends readable semantic text
to the main terminal scrollback instead of painting cells, moving the cursor, or
entering the alternate screen. It disables mouse reporting and cursor hiding even
when a supplied session policy requests them. Keyboard, paste and input decoding
still use the ordinary session lifecycle, including restoration on completion,
interruption or failure. Graphics must be `none`.

The first accepted frame provides context. Later frames announce meaningful focus,
active-option, control value/selection, validation, dialog and live-region changes.
Unchanged redraws, background ordinary text, off live-region content and collection
reordering do not repeatedly speak. Polite and assertive live regions both append
in commit order; the terminal mode does not implement a speech engine or interrupt
screen-reader speech. Long value edits use an explicitly labelled excerpt with the
current caret/selection; repeat context retains the full exposed snapshot.

Press Ctrl+L to repeat current context, unless the application or focused control
has bound that key. Embedders can call `runtime.repeatAccessibleContext()` on a
runtime created with `outputMode: 'accessible'`. Both routes read the last accepted
frame and never rebuild the view or run an update. Repeats are serialized with
writes and rejected while terminal ownership is suspended. On reacquisition, the
next frame restores complete semantic context.

Rejected and cancelled writes do not publish candidate state, frame, focus or an
announcement baseline. An indeterminate write can have delivered partial bytes;
those cannot be removed from scrollback. The next successful frame repeats context
rather than treating that output as accepted. There is no second announcement write
after a visual frame, so visual and accessible streams cannot race each other.

Built-in password inputs continue to omit secret values, lengths and edit positions
from semantic snapshots; accessible output and context repeats do not recover them
from application state or screen cells. Existing sensitive-input transcript
redaction remains in force. Application-authored labels, descriptions and errors
must not contain secrets.

Non-TTY `last_frame` remains a one-shot semantic/plain frame projection and does not
start interactive input. The `outputMode` setting does not override the app's
non-TTY policy. Lower-level `createTuiRuntime` callers own their terminal session
setup; use `runTui` for managed main-screen setup and restoration.

Run a graphics-independent local rehearsal after building:

```sh
node examples/tui/accessible-task.ts
```

Enter on an empty title exercises validation. Type a title, Tab through a made-up
password and priority list, then select Review task. Escape cancels and restores
focus; reopen and choose Run rehearsal for progress and completion. Ctrl+L repeats
context, Ctrl+Q exits, and Ctrl+C cancels. No task or password is transmitted. The same app is covered
by keyboard-sequence tests in both output modes.

This is an opt-in terminal-text accessibility path, not a claim of native
accessibility-tree or screen-reader certification. VoiceOver/macOS and
NVDA/Windows task-level checks require those systems and assistive tools; see the
[native terminal qualification guide](./guides/native-terminal-qualification.md)
for the evidence and remaining manual checks.
