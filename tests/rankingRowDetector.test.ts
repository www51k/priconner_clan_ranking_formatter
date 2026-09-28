import { describe, expect, it } from 'vitest';
import { cardSimilarity, getRankingRowBounds, isRankingCardPixels } from '../src/detection/rankingRowDetector';

describe('ranking row detection helpers', () => {
  it('finds normalized card rows on a 16:9 game screenshot, including a partially visible last row', () => {
    const rows = getRankingRowBounds(1334, 750);
    expect(rows).toHaveLength(4);
    expect(rows[0].x).toBeCloseTo(601.6, 0);
    expect(rows[0].y).toBeCloseTo(100.5, 0);
    expect(rows[0].width).toBeCloseTo(665.7, 0);
    expect(rows[0].completeness).toBe(1);
    expect(rows[3].completeness).toBeGreaterThan(0.55);
    expect(rows[3].completeness).toBeLessThan(1);
  });

  it('uses full-width row bounds for ranking-only crops', () => {
    const rows = getRankingRowBounds(700, 700);
    expect(rows[0].x).toBeCloseTo(24.5);
    expect(rows[0].width).toBeCloseTo(651);
    expect(rows.length).toBeGreaterThan(4);
  });

  it('rejects blank or monochrome strips while accepting bright card content', () => {
    expect(isRankingCardPixels(new Uint8ClampedArray(4 * 32))).toBe(false);
    expect(isRankingCardPixels(new Uint8ClampedArray(4 * 32).fill(245))).toBe(false);
    const pixels = new Uint8ClampedArray(4 * 32);
    for (let index = 0; index < 20; index += 1) pixels.set([245, 245, 245, 255], index * 4);
    for (let index = 20; index < 32; index += 1) pixels.set([15, 100, 230, 255], index * 4);
    expect(isRankingCardPixels(pixels)).toBe(true);
  });

  it('matches duplicate card signatures and rejects different rows', () => {
    const card = new Uint8Array([12, 25, 60, 100, 120, 180]);
    expect(cardSimilarity(card, new Uint8Array(card))).toBe(1);
    expect(cardSimilarity(card, new Uint8Array([12, 25, 60, 101, 120, 180]))).toBeGreaterThan(0.999);
    expect(cardSimilarity(card, new Uint8Array([240, 220, 200, 4, 8, 12]))).toBeLessThan(0.5);
  });
});
