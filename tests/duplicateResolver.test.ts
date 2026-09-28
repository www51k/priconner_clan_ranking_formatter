import { describe, expect, it } from 'vitest';
import { shouldPreferDuplicate } from '../src/ranking/duplicateResolver';

describe('shouldPreferDuplicate', () => {
  it('prefers a newer screenshot even when its crop has lower quality', () => {
    expect(shouldPreferDuplicate(new Date('2026-09-29T12:00:00Z'), new Date('2026-09-28T12:00:00Z'), 10, 100)).toBe(true);
  });

  it('uses crop quality when timestamps are equal or both unknown', () => {
    const sameTime = new Date('2026-09-29T12:00:00Z');
    expect(shouldPreferDuplicate(sameTime, sameTime, 101, 100)).toBe(true);
    expect(shouldPreferDuplicate(null, null, 101, 100)).toBe(true);
  });

  it('prefers the screenshot with a known timestamp over an unknown one', () => {
    expect(shouldPreferDuplicate(new Date('2026-09-29T12:00:00Z'), null, 1, 100)).toBe(true);
    expect(shouldPreferDuplicate(null, new Date('2026-09-29T12:00:00Z'), 100, 1)).toBe(false);
  });
});
