export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  completeness: number;
}

export function getRankingRowBounds(imageWidth: number, imageHeight: number, topEdgeScores?: ArrayLike<number>): CropBounds[] {
  if (imageWidth < 1 || imageHeight < 1) return [];
  const landscapeGameScreen = imageWidth / imageHeight >= 1.45;
  const x = landscapeGameScreen ? imageWidth * 0.451 : imageWidth * 0.035;
  const width = imageWidth * (landscapeGameScreen ? 0.499 : 0.93);
  const firstY = imageHeight * (landscapeGameScreen ? 0.134 : 0.025);
  const rowHeight = imageHeight * (landscapeGameScreen ? 0.176 : 0.19);
  const rowStep = imageHeight * (landscapeGameScreen ? 0.2 : 0.2);
  const visibleBottom = imageHeight * (landscapeGameScreen ? 0.866 : 0.99);
  const rows: CropBounds[] = [];
  const alignedFirstY = topEdgeScores ? findAlignedFirstRow(firstY, rowStep, visibleBottom, topEdgeScores) : firstY;
  if (alignedFirstY === null) return [];

  for (let index = 0; index < 30; index += 1) {
    const y = alignedFirstY + index * rowStep;
    if (y + rowHeight > visibleBottom) break;
    if (topEdgeScores && topEdgeScores[Math.round(y)] < 0.45) break;
    rows.push({ x, y, width, height: rowHeight, completeness: 1 });
  }
  return rows;
}

export function getHorizontalCardTopEdgeScores(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
  const scores = new Float32Array(height);
  if (width < 1 || height < 2 || pixels.length < width * height * 4) return scores;
  for (let y = 1; y < height; y += 1) {
    let cardBorderPixels = 0;
    for (let x = 0; x < width; x += 1) {
      const current = (y * width + x) * 4;
      const previous = current - width * 4;
      const change = (Math.abs(pixels[current] - pixels[previous])
        + Math.abs(pixels[current + 1] - pixels[previous + 1])
        + Math.abs(pixels[current + 2] - pixels[previous + 2])) / 3;
      if (change > 15 && change < 45) cardBorderPixels += 1;
    }
    scores[y] = cardBorderPixels / width;
  }
  return scores;
}

function findAlignedFirstRow(firstY: number, rowStep: number, visibleBottom: number, edgeScores: ArrayLike<number>): number | null {
  const minimum = Math.max(1, Math.floor(firstY - rowStep * 0.07));
  const maximum = Math.min(Math.ceil(firstY + rowStep * 0.55), Math.floor(visibleBottom - rowStep * 1.5));
  let bestY: number | null = null;
  let bestScore = 0;
  for (let y = minimum; y <= maximum; y += 1) {
    const firstScore = edgeScores[y] ?? 0;
    if (firstScore < 0.45) continue;
    let score = 0;
    let count = 0;
    for (let rowY = y; rowY + rowStep < visibleBottom; rowY += rowStep) {
      score += edgeScores[Math.round(rowY)] ?? 0;
      count += 1;
    }
    const average = count ? score / count : 0;
    if (average > bestScore) {
      bestScore = average;
      bestY = y;
    }
  }
  return bestScore >= 0.45 ? bestY : null;
}

export function isRankingCardPixels(pixels: Uint8ClampedArray): boolean {
  if (pixels.length < 4) return false;
  let light = 0;
  let colorful = 0;
  let samples = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
    if (luminance > 0.68) light += 1;
    if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 55) colorful += 1;
    samples += 1;
  }
  return samples > 0 && light / samples > 0.58 && colorful / samples > 0.08;
}

export async function makeCardSignature(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 20;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('画像照合用Canvasを初期化できませんでした。');
  }
  context.drawImage(bitmap, bitmap.width * 0.02, bitmap.height * 0.08, bitmap.width * 0.18, bitmap.height * 0.8, 0, 0, 16, 20);
  context.drawImage(bitmap, bitmap.width * 0.44, bitmap.height * 0.04, bitmap.width * 0.42, bitmap.height * 0.34, 16, 0, 32, 8);
  context.drawImage(bitmap, bitmap.width * 0.18, bitmap.height * 0.05, bitmap.width * 0.26, bitmap.height * 0.31, 16, 10, 20, 8);
  context.drawImage(bitmap, bitmap.width * 0.8, bitmap.height * 0.05, bitmap.width * 0.15, bitmap.height * 0.31, 36, 10, 12, 8);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const signature = new Uint8Array(pixels.length / 4 * 3);
  for (let source = 0, target = 0; source < pixels.length; source += 4) {
    signature[target++] = pixels[source];
    signature[target++] = pixels[source + 1];
    signature[target++] = pixels[source + 2];
  }
  canvas.width = 0;
  canvas.height = 0;
  return signature;
}

export function cardSimilarity(first: Uint8Array, second: Uint8Array): number {
  if (!first.length || first.length !== second.length) return 0;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference += Math.abs(first[index] - second[index]);
  return 1 - difference / (first.length * 255);
}
