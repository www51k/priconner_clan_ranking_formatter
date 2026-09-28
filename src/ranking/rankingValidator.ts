import { FIRST_RANK, LAST_RANK, isRankNumber, type RankingEntry } from '../types/ranking';

export function getMissingRanks(entries: Iterable<RankingEntry>): number[] {
  const present = new Set(Array.from(entries, (entry) => entry.rank));
  return Array.from({ length: LAST_RANK - FIRST_RANK + 1 }, (_, index) => index + FIRST_RANK)
    .filter((rank) => !present.has(rank));
}

export function validateRank(rank: number): boolean {
  return isRankNumber(rank);
}
