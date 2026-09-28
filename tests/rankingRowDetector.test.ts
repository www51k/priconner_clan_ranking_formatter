import { describe, expect, it } from 'vitest';
import { cardSimilarity, getHorizontalCardTopEdgeScores, getRankingRowBounds, isRankingCardPixels, RANKING_ROW_ASPECT_RATIO } from '../src/detection/rankingRowDetector';

describe('ranking row detection helpers', () => {
  it('finds only complete normalized card rows on a 16:9 game screenshot', () => {
    const rows = getRankingRowBounds(1334, 750);
    expect(rows).toHaveLength(3);
    expect(rows[0].x).toBeCloseTo(601.6, 0);
    expect(rows[0].y).toBeCloseTo(100.5, 0);
    expect(rows[0].width / rows[0].height).toBeCloseTo(RANKING_ROW_ASPECT_RATIO, 2);
    expect(rows[0].completeness).toBe(1);
  });

  it('aligns to visible card top borders and excludes a clipped last row', () => {
    const width = 80;
    const height = 750;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels.set([246, 243, 240, 255], offset);
      }
    }
    for (const y of [131, 281, 431, 581]) {
      for (let x = 0; x < width; x += 1) pixels.set([207, 208, 222, 255], (y * width + x) * 4);
    }
    const scores = getHorizontalCardTopEdgeScores(pixels, width, height);
    const rows = getRankingRowBounds(1334, height, scores);
    expect(rows).toHaveLength(3);
    expect(rows[0].y).toBe(131);
    expect(rows[1].y).toBeCloseTo(281, 0);
  });

  it('adjusts crop width and row spacing for ultrawide screenshots', () => {
    const width = 160;
    const height = 1260;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) pixels.set([246, 243, 240, 255], (y * width + x) * 4);
    }
    for (const y of [210, 450, 690, 930]) {
      for (let x = 0; x < width; x += 1) pixels.set([207, 208, 222, 255], (y * width + x) * 4);
    }
    const scores = getHorizontalCardTopEdgeScores(pixels, width, height);
    const rows = getRankingRowBounds(2736, height, scores);
    expect(rows).toHaveLength(3);
    expect(rows[0].x).toBeCloseTo(1233.9, 0);
    expect(rows[0].width / rows[0].height).toBeCloseTo(RANKING_ROW_ASPECT_RATIO, 2);
    expect(rows[0].y).toBe(210);
    expect(rows[1].y).toBeCloseTo(450, 0);
  });

  it('uses full-width row bounds for ranking-only crops', () => {
    const rows = getRankingRowBounds(700, 700);
    expect(rows[0].x).toBeCloseTo(24.5);
    expect(rows[0].width / rows[0].height).toBeCloseTo(RANKING_ROW_ASPECT_RATIO, 2);
    expect(rows[0].x + rows[0].width).toBeLessThan(700);
    expect(rows.length).toBe(4);
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
