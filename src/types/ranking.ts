export const FIRST_RANK = 1;
export const LAST_RANK = 30;

export interface ImageSource {
  id: string;
  file: File;
  url: string;
  capturedAt: Date | null;
}

export interface RankingEntry {
  id: string;
  rank: number;
  sourceId: string;
  sourceName: string;
  capturedAt: Date | null;
  crop: Blob;
  cropUrl: string;
  quality: number;
  confidence: number | null;
  duplicateCount: number;
}

export function isRankNumber(value: number): boolean {
  return Number.isInteger(value) && value >= FIRST_RANK && value <= LAST_RANK;
}
