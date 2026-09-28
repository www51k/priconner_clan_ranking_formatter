type DateParts = [year: number, month: number, day: number, hour: number, minute: number, second: number];

const patterns: Array<{ regex: RegExp; groups: number[] }> = [
  // YYYY-MM-DD-HH-MM-SS (also accepts dots/underscores between date fields).
  { regex: /(20\d{2})[-_.](\d{2})[-_.](\d{2})[-_.](\d{2})[-_.](\d{2})[-_.](\d{2})/, groups: [1, 2, 3, 4, 5, 6] },
  // YYYY-MM-DD HH.MM.SS and YYYY-MM-DD_HH:MM:SS.
  { regex: /(20\d{2})[-_.年](\d{2})[-_.月](\d{2})(?:日)?[ T_]+(\d{2})[.:時](\d{2})(?:[.:分](\d{2}))?/, groups: [1, 2, 3, 4, 5, 6] },
  // YYYY-MM-DD_HHMMSS.
  { regex: /(20\d{2})[-_.年](\d{2})[-_.月](\d{2})(?:日)?[ T_]+(\d{2})(\d{2})(\d{2})\b/, groups: [1, 2, 3, 4, 5, 6] },
  // Screenshot_YYYYMMDD_HHMMSS.
  { regex: /(?:Screenshot|スクリーンショット)[_ -]?(20\d{2})(\d{2})(\d{2})[_ -]?(\d{2})(\d{2})(\d{2})?/i, groups: [1, 2, 3, 4, 5, 6] },
];

export function parseImageDate(filename: string, lastModified?: number): Date | null {
  for (const { regex, groups } of patterns) {
    const match = filename.match(regex);
    if (!match) continue;
    const values = groups.map((index) => Number(match[index] ?? 0));
    const [year, month, day, hour, minute, second] = values as DateParts;
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (isValidDateParts(date, year, month, day, hour, minute, second)) return date;
  }
  if (lastModified && Number.isFinite(lastModified)) return new Date(lastModified);
  return null;
}

function isValidDateParts(date: Date, year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && hour <= 23 && minute <= 59 && second <= 59;
}

export function formatCaptureDate(date: Date | null): string {
  if (!date) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
