import { LAST_RANK, type RankingEntry } from '../types/ranking';

export const CARD_WIDTH = 520;
export const CARD_HEIGHT = 150;
const GAP = 14;
const PADDING = 24;

export async function composeRanking(entries: ReadonlyMap<number, RankingEntry>): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = PADDING * 2 + CARD_WIDTH * 3 + GAP * 2;
  canvas.height = PADDING * 2 + CARD_HEIGHT * 10 + GAP * 9;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvasを初期化できませんでした。');

  context.fillStyle = '#10131a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let rank = 1; rank <= LAST_RANK; rank += 1) {
    const column = Math.floor((rank - 1) / 10);
    const row = (rank - 1) % 10;
    const x = PADDING + column * (CARD_WIDTH + GAP);
    const y = PADDING + row * (CARD_HEIGHT + GAP);
    const entry = entries.get(rank);
    context.fillStyle = '#202530';
    context.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);

    if (!entry) {
      context.fillStyle = '#080a0e';
      context.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);
      context.fillStyle = '#d9deea';
      context.font = '700 28px sans-serif';
      context.fillText(`${rank}位`, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 - 15);
      context.fillStyle = '#929baa';
      context.font = '20px sans-serif';
      context.fillText('未取得', x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 + 22);
      continue;
    }

    const image = await loadImage(entry.cropUrl);
    const scale = Math.min(CARD_WIDTH / image.naturalWidth, CARD_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, x + (CARD_WIDTH - width) / 2, y + (CARD_HEIGHT - height) / 2, width, height);
  }
  return canvas;
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
