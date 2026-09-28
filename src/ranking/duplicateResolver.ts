export function shouldPreferDuplicate(
  candidateDate: Date | null,
  currentDate: Date | null,
  candidateQuality: number,
  currentQuality: number,
): boolean {
  if (candidateDate && currentDate && candidateDate.getTime() !== currentDate.getTime()) {
    return candidateDate.getTime() > currentDate.getTime();
  }
  if (candidateDate && !currentDate) return true;
  if (!candidateDate && currentDate) return false;
  return candidateQuality > currentQuality;
}
