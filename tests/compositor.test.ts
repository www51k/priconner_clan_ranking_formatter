import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT, CARD_WIDTH } from '../src/compose/compositor';

describe('ranking layout', () => {
  it('maps ranks into three columns of ten, in column-major order', () => {
    const cellFor = (rank: number) => ({ column: Math.floor((rank - 1) / 10), row: (rank - 1) % 10 });
    expect([cellFor(1), cellFor(2), cellFor(10), cellFor(11), cellFor(21), cellFor(30)])
      .toEqual([{ column: 0, row: 0 }, { column: 0, row: 1 }, { column: 0, row: 9 }, { column: 1, row: 0 }, { column: 2, row: 0 }, { column: 2, row: 9 }]);
    expect(CARD_WIDTH).toBeGreaterThan(CARD_HEIGHT);
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(5, 0);
  });
});
