import { describe, expect, it } from 'vitest';
import { parseImageDate } from '../src/datetime/imageDateParser';

describe('parseImageDate', () => {
  it.each([
    ['Screenshot_20260928_225430.png', '2026-09-28T22:54:30'],
    ['Screenshot_2026-09-28-22-54-30.png', '2026-09-28T22:54:30'],
    ['2026-09-28_225430.png', '2026-09-28T22:54:30'],
    ['スクリーンショット 2026-09-28 22.54.30.png', '2026-09-28T22:54:30'],
  ])('%s', (filename, expected) => {
    const actual = parseImageDate(filename)!;
    const expectedLocal = new Date(expected);
    expect([actual.getFullYear(), actual.getMonth(), actual.getDate(), actual.getHours(), actual.getMinutes(), actual.getSeconds()])
      .toEqual([expectedLocal.getFullYear(), expectedLocal.getMonth(), expectedLocal.getDate(), expectedLocal.getHours(), expectedLocal.getMinutes(), expectedLocal.getSeconds()]);
  });
  it('falls back to File.lastModified and leaves unknown dates empty', () => {
    expect(parseImageDate('ranking.png', 1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000);
    expect(parseImageDate('ranking.png')).toBeNull();
  });
});
