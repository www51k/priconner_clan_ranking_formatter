import { LAST_RANK, type RankingEntry } from '../types/ranking';

export const CARD_WIDTH = 520;
export const CARD_HEIGHT = 104;

export async function composeRanking(entries: ReadonlyMap<number, RankingEntry>): Promise<HTMLCanvasElement> {
  const images = new Map<number, HTMLImageElement>();
  const heights = new Map<number, number>();
  const columnHeights = [0, 0, 0];
  for (let rank = 1; rank <= LAST_RANK; rank += 1) {
    const column = Math.floor((rank - 1) / 10);
    const entry = entries.get(rank);
    const image = entry ? await loadImage(entry.cropUrl) : undefined;
    if (image) images.set(rank, image);
    const height = image ? CARD_WIDTH * image.naturalHeight / image.naturalWidth : CARD_HEIGHT;
    heights.set(rank, height);
    columnHeights[column] += height;
  }

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * 3;
  canvas.height = Math.ceil(Math.max(...columnHeights));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvasを初期化できませんでした。');

  context.fillStyle = '#10131a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let rank = 1; rank <= LAST_RANK; rank += 1) {
    const column = Math.floor((rank - 1) / 10);
    const x = column * CARD_WIDTH;
    const columnOffset = heightsForColumnBefore(rank, heights);
    const entry = entries.get(rank);
    const height = heights.get(rank)!;
    context.fillStyle = '#202530';
    context.fillRect(x, columnOffset, CARD_WIDTH, height);

    if (!entry) {
      context.fillStyle = '#080a0e';
      context.fillRect(x, columnOffset, CARD_WIDTH, height);
      context.fillStyle = '#d9deea';
      context.font = '700 28px sans-serif';
      context.fillText(`${rank}位`, x + CARD_WIDTH / 2, columnOffset + height / 2 - 15);
      context.fillStyle = '#929baa';
      context.font = '20px sans-serif';
      context.fillText('未取得', x + CARD_WIDTH / 2, columnOffset + height / 2 + 22);
      continue;
    }

    context.drawImage(images.get(rank)!, x, columnOffset, CARD_WIDTH, height);
  }
  return canvas;
}

function heightsForColumnBefore(rank: number, heights: ReadonlyMap<number, number>): number {
  const firstRank = Math.floor((rank - 1) / 10) * 10 + 1;
  let offset = 0;
  for (let priorRank = firstRank; priorRank < rank; priorRank += 1) offset += heights.get(priorRank)!;
  return offset;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNGを生成できませんでした。')), 'image/png'));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('切り抜き画像を読み込めませんでした。'));
    image.src = url;
  });
}
