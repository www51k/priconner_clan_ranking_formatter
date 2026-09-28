import { describe, expect, it } from 'vitest';
import { getMissingRanks, validateRank } from '../src/ranking/rankingValidator';
import type { RankingEntry } from '../src/types/ranking';

const entry = (rank: number) => ({ rank }) as RankingEntry;

describe('ranking validation', () => {
  it('reports all absent positions from 1 to 30', () => {
    expect(getMissingRanks([entry(1), entry(30)])).toEqual(Array.from({ length: 28 }, (_, i) => i + 2));
  });
  it('accepts only integer ranks from 1 to 30', () => {
    expect(validateRank(1)).toBe(true);
    expect(validateRank(30)).toBe(true);
    expect(validateRank(0)).toBe(false);
    expect(validateRank(31)).toBe(false);
    expect(validateRank(1.5)).toBe(false);
  });
});
