import { cardSimilarity, getHorizontalCardTopEdgeScores, getRankingRowBounds, isRankingCardPixels, makeCardSignature } from './detection/rankingRowDetector';
import { canvasToPng, composeRanking } from './compose/compositor';
import { formatCaptureDate, parseImageDate } from './datetime/imageDateParser';
import { shouldPreferDuplicate } from './ranking/duplicateResolver';
import { getMissingRanks, validateRank } from './ranking/rankingValidator';
import { LAST_RANK, type ImageSource, type RankingEntry } from './types/ranking';

const DUPLICATE_SIMILARITY = 0.97;

export function startApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="page-shell">
      <header class="hero">
        <div class="hero-copy">
          <p class="eyebrow">PRINCESS CONNECT! RE:DIVE</p>
          <h1>クランバトルランキング整形</h1>
          <p class="intro">ランキング画面を追加すると、カードを自動で切り出して1位から並べます。</p>
        </div>
        <div class="privacy"><span class="privacy-dot"></span>画像はこのブラウザ内で処理されます</div>
      </header>

      <section class="panel upload-panel" aria-labelledby="upload-heading">
        <div class="section-heading">
          <div><span class="step">01</span><h2 id="upload-heading">ランキング画像を追加</h2></div>
          <div class="upload-actions">
            <span class="muted" id="source-count">0枚選択済み</span>
            <button class="button button-secondary" id="clear-all" type="button" disabled>クリア</button>
          </div>
        </div>
        <label class="dropzone" id="dropzone" for="file-input">
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          <span class="upload-icon" aria-hidden="true">＋</span>
          <strong>画像を選択、またはここにドロップ</strong>
          <span>PNG・JPEG・WebP / まとめて追加すると自動解析します</span>
        </label>
        <p class="help upload-help">1位から下へスクロールした順に画像を選んでください。重複して写ったカードは画像照合でまとめます。</p>
        <div id="source-list" class="source-list empty-note">追加した画像がここに表示されます。</div>
      </section>

      <section class="workspace-grid">
        <section class="panel analysis-panel" aria-labelledby="analysis-heading">
          <div class="section-heading">
            <div><span class="step">02</span><h2 id="analysis-heading">自動解析</h2></div>
            <strong id="entry-count" class="count-pill">0 / 30</strong>
          </div>
          <p class="help">行の位置を検出し、表示順から順位を割り当てます。カードの見た目を照合して重複を除きます。</p>
          <p class="status-line analysis-status" id="analysis-status" aria-live="polite">画像を追加すると自動で解析します。</p>
          <div class="missing-summary" id="missing-summary"></div>
          <div class="entry-list" id="entry-list"></div>
        </section>

        <section class="panel preview-panel" aria-labelledby="preview-heading">
          <div class="section-heading preview-heading">
            <div><span class="step">03</span><h2 id="preview-heading">完成プレビュー</h2></div>
            <button class="button button-primary" id="download" disabled>PNGを保存</button>
          </div>
          <p class="help">左列が1〜10位、中央列が11〜20位、右列が21〜30位です。未登録の順位は黒い枠で表示します。</p>
          <div class="preview-wrap" id="preview-wrap"><div class="preview-empty">画像を追加すると自動解析を始めます。</div></div>
        </section>
      </section>

      <footer class="build-info">
        <span>バージョン ${__APP_VERSION__} · コミット <code>${__APP_COMMIT__}</code> · ${formatBuildTime(__APP_COMMIT_TIME__)}</span>
        <span class="freshness" id="freshness-status" role="status" aria-live="polite">最新状態を確認中…</span>
        <button class="freshness-check" id="check-freshness" type="button">最新状態を再確認</button>
      </footer>
    </main>`;

  const sources = new Map<string, ImageSource>();
  const entries = new Map<number, RankingEntry>();
  const input = query<HTMLInputElement>(root, '#file-input');
  const dropzone = query<HTMLLabelElement>(root, '#dropzone');
  const sourceList = query<HTMLDivElement>(root, '#source-list');
  const analysisStatus = query<HTMLParagraphElement>(root, '#analysis-status');
  const entryList = query<HTMLDivElement>(root, '#entry-list');
  const missingSummary = query<HTMLDivElement>(root, '#missing-summary');
  const previewWrap = query<HTMLDivElement>(root, '#preview-wrap');
  const downloadButton = query<HTMLButtonElement>(root, '#download');
  const clearButton = query<HTMLButtonElement>(root, '#clear-all');
  const freshnessStatus = query<HTMLSpanElement>(root, '#freshness-status');
  const freshnessButton = query<HTMLButtonElement>(root, '#check-freshness');
  let generation = 0;
  let previewGeneration = 0;

  freshnessButton.addEventListener('click', () => void checkFreshness());
  void checkFreshness();
  clearButton.addEventListener('click', clearAll);
  input.addEventListener('change', () => {
    if (input.files) void addFiles(input.files);
    input.value = '';
  });
  for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
  for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
  dropzone.addEventListener('drop', (event) => {
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer?.files) void addFiles(transfer.files);
  });

  downloadButton.addEventListener('click', async () => {
    downloadButton.disabled = true;
    downloadButton.textContent = 'PNGを生成中…';
    try {
      const canvas = await composeRanking(entries);
      const blob = await canvasToPng(canvas);
      canvas.width = 0;
      canvas.height = 0;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `priconne_clan_ranking_${filenameDate()}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      analysisStatus.textContent = 'PNGを保存しました。';
    } catch (error) {
      analysisStatus.textContent = error instanceof Error ? error.message : 'PNG生成に失敗しました。';
    } finally {
      downloadButton.textContent = 'PNGを保存';
      downloadButton.disabled = entries.size === 0;
    }
  });

  async function addFiles(fileList: FileList): Promise<void> {
    const accepted = [...fileList].filter((file) => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
    const rejected = fileList.length - accepted.length;
    for (const file of accepted) {
      const id = crypto.randomUUID();
      sources.set(id, { id, file, url: URL.createObjectURL(file), capturedAt: parseImageDate(file.name, file.lastModified) });
    }
    renderSources();
    if (accepted.length) await analyzeSources();
    if (rejected) analysisStatus.textContent = `${rejected}件は対応していない形式のため追加しませんでした。`;
  }

  function renderSources(): void {
    query<HTMLElement>(root, '#source-count').textContent = `${sources.size}枚選択済み`;
    clearButton.disabled = sources.size === 0;
    sourceList.classList.toggle('empty-note', sources.size === 0);
    if (!sources.size) {
      sourceList.textContent = '追加した画像がここに表示されます。';
      return;
    }
    sourceList.innerHTML = [...sources.values()].map((source) => `
      <article class="source-card">
        <img src="${source.url}" alt="" loading="lazy" />
        <span class="source-info"><strong>${escapeHtml(source.file.name)}</strong><small>${formatCaptureDate(source.capturedAt)}</small></span>
        <button class="source-remove" data-remove-source="${source.id}" type="button" aria-label="${escapeHtml(source.file.name)}を削除">×</button>
      </article>`).join('');
    sourceList.querySelectorAll<HTMLButtonElement>('[data-remove-source]').forEach((button) => button.addEventListener('click', () => {
      const source = sources.get(button.dataset.removeSource!);
      if (!source) return;
      sources.delete(source.id);
      URL.revokeObjectURL(source.url);
      renderSources();
      void analyzeSources();
    }));
  }

  function clearAll(): void {
    generation += 1;
    previewGeneration += 1;
    for (const source of sources.values()) URL.revokeObjectURL(source.url);
    sources.clear();
    clearEntries();
    input.value = '';
    renderSources();
    renderEntries();
    void renderPreview();
    analysisStatus.textContent = 'クリアしました。画像を追加すると自動解析します。';
  }

  async function analyzeSources(): Promise<void> {
    const currentGeneration = ++generation;
    clearEntries();
    renderEntries();
    void renderPreview();
    if (!sources.size) {
      analysisStatus.textContent = '画像を追加すると自動で解析します。';
      void renderPreview();
      return;
    }

    const matchedRows: Array<{ entry: RankingEntry; signature: Uint8Array }> = [];
    let nextRank = 1;
    let detectedCount = 0;
    let duplicateCount = 0;
    let failedSources = 0;
    const orderedSources = [...sources.values()];

    for (let sourceIndex = 0; sourceIndex < orderedSources.length; sourceIndex += 1) {
      if (currentGeneration !== generation) return;
      const source = orderedSources[sourceIndex];
      analysisStatus.textContent = `${sourceIndex + 1} / ${orderedSources.length}枚目を解析中…`;
      let image: HTMLImageElement;
      try {
        image = await loadImage(source.url);
      } catch {
        failedSources += 1;
        continue;
      }
      const landscapeGameScreen = image.naturalWidth / image.naturalHeight >= 1.45;
      const sampleX = image.naturalWidth * (landscapeGameScreen ? 0.451 : 0.035);
      const sampleWidth = image.naturalWidth * (landscapeGameScreen ? 0.499 : 0.93);
      const edgeCanvas = document.createElement('canvas');
      edgeCanvas.width = 160;
      edgeCanvas.height = image.naturalHeight;
      const edgeContext = edgeCanvas.getContext('2d', { willReadFrequently: true });
      if (!edgeContext) {
        failedSources += 1;
        continue;
      }
      edgeContext.drawImage(image, sampleX, 0, sampleWidth, image.naturalHeight, 0, 0, edgeCanvas.width, edgeCanvas.height);
      const edgeScores = getHorizontalCardTopEdgeScores(edgeContext.getImageData(0, 0, edgeCanvas.width, edgeCanvas.height).data, edgeCanvas.width, edgeCanvas.height);
      edgeCanvas.width = 0;
      edgeCanvas.height = 0;
      const bounds = getRankingRowBounds(image.naturalWidth, image.naturalHeight, edgeScores);
      let sourceCandidates = 0;
      for (const box of bounds) {
        if (currentGeneration !== generation || nextRank > LAST_RANK) break;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.round(box.width);
        cropCanvas.height = Math.round(box.height);
        const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });
        if (!cropContext || cropCanvas.width < 1 || cropCanvas.height < 1) continue;
        cropContext.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, cropCanvas.width, cropCanvas.height);

        const sample = document.createElement('canvas');
        sample.width = 32;
        sample.height = 16;
        const sampleContext = sample.getContext('2d', { willReadFrequently: true });
        if (!sampleContext) continue;
        sampleContext.drawImage(cropCanvas, 0, 0, sample.width, sample.height);
        const isCard = isRankingCardPixels(sampleContext.getImageData(0, 0, sample.width, sample.height).data);
        sample.width = 0;
        sample.height = 0;
        if (!isCard) {
          cropCanvas.width = 0;
          cropCanvas.height = 0;
          continue;
        }
        sourceCandidates += 1;

        let crop: Blob;
        try {
          crop = await canvasToPng(cropCanvas);
        } catch {
          cropCanvas.width = 0;
          cropCanvas.height = 0;
          continue;
        }
        cropCanvas.width = 0;
        cropCanvas.height = 0;
        if (currentGeneration !== generation) return;
        let signature: Uint8Array;
        try {
          signature = await makeCardSignature(crop);
        } catch {
          continue;
        }
        if (currentGeneration !== generation) return;
        const duplicate = matchedRows.find((candidate) => cardSimilarity(candidate.signature, signature) >= DUPLICATE_SIMILARITY);
        detectedCount += 1;

        if (duplicate) {
          duplicateCount += 1;
          duplicate.entry.duplicateCount += 1;
          const quality = crop.size * box.completeness;
          if (shouldPreferDuplicate(source.capturedAt, duplicate.entry.capturedAt, quality, duplicate.entry.quality)) {
            URL.revokeObjectURL(duplicate.entry.cropUrl);
            duplicate.entry.sourceId = source.id;
            duplicate.entry.sourceName = source.file.name;
            duplicate.entry.capturedAt = source.capturedAt;
            duplicate.entry.crop = crop;
            duplicate.entry.cropUrl = URL.createObjectURL(crop);
            duplicate.entry.quality = quality;
            duplicate.signature = signature;
          }
          continue;
        }

        const rank = nextRank++;
        const entry: RankingEntry = {
          id: crypto.randomUUID(), rank, sourceId: source.id, sourceName: source.file.name,
          capturedAt: source.capturedAt, crop, cropUrl: URL.createObjectURL(crop),
          quality: crop.size * box.completeness, confidence: box.completeness, duplicateCount: 1,
        };
        entries.set(rank, entry);
        matchedRows.push({ entry, signature });
      }
      image.src = '';
      if (sourceCandidates === 0) failedSources += 1;
    }

    if (currentGeneration !== generation) return;
    renderEntries();
    await renderPreview();
    if (entries.size === 0) {
      analysisStatus.textContent = failedSources
        ? 'ランキング行を検出できませんでした。全クランランキングの画面を追加してください。'
        : '画像からカード候補を見つけられませんでした。';
    } else {
      analysisStatus.textContent = `${detectedCount}件を検出し、${entries.size}件を登録しました。${duplicateCount ? `重複${duplicateCount}件を画像照合で統合。` : ''}${failedSources ? `解析できない画像${failedSources}枚。` : ''}`;
    }
  }

  function clearEntries(): void {
    for (const entry of entries.values()) URL.revokeObjectURL(entry.cropUrl);
    entries.clear();
  }

  function renderEntries(): void {
    const sorted = [...entries.values()].sort((a, b) => a.rank - b.rank);
    query<HTMLElement>(root, '#entry-count').textContent = `${entries.size} / 30`;
    const missing = getMissingRanks(entries.values());
    missingSummary.innerHTML = missing.length
      ? `<span>未登録 ${missing.length}件:</span> ${missing.join('・')}位`
      : '<span class="complete-label">30位まで登録済み</span>';
    if (!sorted.length) {
      entryList.innerHTML = '<div class="list-empty">自動解析したカードがここに並びます。</div>';
      return;
    }
    entryList.innerHTML = sorted.map((entry) => `
      <div class="entry-row" data-entry="${entry.rank}">
        <img src="${entry.cropUrl}" alt="${entry.rank}位の切り抜き" />
        <div class="entry-meta"><strong>${entry.rank}位</strong><small title="${escapeHtml(entry.sourceName)}">${escapeHtml(entry.sourceName)}</small><small>${entry.confidence !== null && entry.confidence < 0.99 ? '末尾行一部表示 · ' : ''}${formatCaptureDate(entry.capturedAt)} · ${entry.duplicateCount}候補</small></div>
        <select aria-label="${entry.rank}位の順位修正" data-change-rank="${entry.rank}">${Array.from({ length: LAST_RANK }, (_, i) => `<option value="${i + 1}" ${i + 1 === entry.rank ? 'selected' : ''}>${i + 1}位</option>`).join('')}</select>
        <button type="button" class="icon-button" data-delete="${entry.rank}" aria-label="${entry.rank}位を削除">削除</button>
      </div>`).join('');
    entryList.querySelectorAll<HTMLSelectElement>('[data-change-rank]').forEach((select) => select.addEventListener('change', () => {
      const oldRank = Number(select.dataset.changeRank);
      const newRank = Number(select.value);
      const entry = entries.get(oldRank);
      if (!entry || !validateRank(newRank)) return;
      const replaced = entries.get(newRank);
      if (replaced && replaced !== entry) {
        URL.revokeObjectURL(replaced.cropUrl);
      }
      entries.delete(oldRank);
      entry.rank = newRank;
      entries.set(newRank, entry);
      renderEntries();
      void renderPreview();
    }));
    entryList.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((button) => button.addEventListener('click', () => {
      const rank = Number(button.dataset.delete);
      const entry = entries.get(rank);
      if (entry) URL.revokeObjectURL(entry.cropUrl);
      entries.delete(rank);
      renderEntries();
      void renderPreview();
    }));
  }

  async function renderPreview(): Promise<void> {
    const current = ++previewGeneration;
    downloadButton.disabled = entries.size === 0;
    if (!entries.size) {
      previewWrap.innerHTML = '<div class="preview-empty">画像を追加すると自動解析を始めます。</div>';
      return;
    }
    previewWrap.innerHTML = '<div class="preview-empty">プレビューを更新中…</div>';
    try {
      const canvas = await composeRanking(entries);
      if (current !== previewGeneration) return;
      canvas.className = 'ranking-preview';
      previewWrap.replaceChildren(canvas);
    } catch {
      if (current === previewGeneration) previewWrap.innerHTML = '<div class="preview-empty">プレビューを更新できませんでした。</div>';
    }
  }

  async function checkFreshness(): Promise<void> {
    freshnessButton.disabled = true;
    freshnessStatus.textContent = '公開版を確認中…';
    freshnessStatus.dataset.state = 'checking';
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Version metadata returned ${response.status}`);
      const latest = await response.json() as { commit?: unknown };
      if (typeof latest.commit !== 'string') throw new Error('Version metadata did not include a commit SHA');
      if (latest.commit.startsWith(__APP_COMMIT__)) {
        freshnessStatus.textContent = '公開中の最新版です';
        freshnessStatus.dataset.state = 'current';
      } else {
        freshnessStatus.textContent = `新しい公開版があります（${latest.commit.slice(0, 12)}）`;
        freshnessStatus.dataset.state = 'outdated';
      }
    } catch {
      freshnessStatus.textContent = '公開状態を確認できません';
      freshnessStatus.dataset.state = 'unknown';
    } finally {
      freshnessButton.disabled = false;
    }
  }

  function filenameDate(): string {
    const latest = [...entries.values()].map((entry) => entry.capturedAt).filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${latest.getFullYear()}-${pad(latest.getMonth() + 1)}-${pad(latest.getDate())}_${pad(latest.getHours())}${pad(latest.getMinutes())}${pad(latest.getSeconds())}`;
  }

  renderSources();
  renderEntries();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = url;
  });
}

function formatBuildTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'コミット日時不明';
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(date);
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
