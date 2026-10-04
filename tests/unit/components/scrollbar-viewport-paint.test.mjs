import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutComponentScrollbar, paintComponentScrollbar } from '../../../dist/component/scrollbar.js';
import { defaultTextWidthProfile } from '../../../dist/text/index.js';
import { defaultTheme } from '../../../dist/theme/index.js';

const huge = 2 ** 31 - 1;

for (const axis of ['vertical', 'horizontal']) {
  test(`huge ${axis} scrollbar paints only viewport cells using logical thumb offsets`, () => {
    const plan = layoutComponentScrollbar({
      bounds: { row: 0, column: 0, width: axis === 'vertical' ? 8 : huge, height: axis === 'vertical' ? huge : 8 },
      scroll: { offsetRow: huge, offsetColumn: huge, followTail: false },
      contentRows: huge * 3, contentColumns: huge * 3,
      options: { visible: 'always', axis },
    });
    const track = axis === 'vertical' ? plan.layout.verticalTrack : plan.layout.horizontalTrack;
    const original = structuredClone(track);
    for (const offset of [0, track.thumb.start - 1, track.thumb.start + track.thumb.size - 1, huge - 2]) {
      const writes = [];
      const row = track.bounds.row + (axis === 'vertical' ? offset : 0);
      const column = track.bounds.column + (axis === 'horizontal' ? offset : 0);
      paintComponentScrollbar({
        plan, theme: defaultTheme, viewport: { row, column, width: axis === 'vertical' ? 1 : 2, height: axis === 'vertical' ? 2 : 1 },
        target: { widthProfile: defaultTextWidthProfile, write(row, column, spans) {
          assert.ok(writes.length < 2, 'track work must be bounded before writing');
          writes.push({ row, column, spans });
        } },
        frameSource: value => value,
      });
      assert.equal(writes.length, 2);
      for (const [index, write] of writes.entries()) {
        const logicalOffset = offset + index;
        assert.equal(write.row, row + (axis === 'vertical' ? index : 0));
        assert.equal(write.column, column + (axis === 'horizontal' ? index : 0));
        const thumb = logicalOffset >= track.thumb.start && logicalOffset < track.thumb.start + track.thumb.size;
        assert.equal(write.spans[0].source.partType, thumb ? 'thumb' : 'track');
      }
    }
    assert.deepEqual(track, original, 'painting must preserve track and drag geometry');
  });
}
