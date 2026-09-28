import { canvasToPng, composeRanking } from './compose/compositor';
import { formatCaptureDate, parseImageDate } from './datetime/imageDateParser';
import { getMissingRanks, validateRank } from './ranking/rankingValidator';
import { LAST_RANK, type ImageSource, type RankingEntry } from './types/ranking';

export function startApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="page-shell">
      <header class="hero">
        <div class="hero-copy">
          <p class="eyebrow">PRINCESS CONNECT! RE:DIVE</p>
          <h1>クランバトルランキング整形</h1>
          <p class="intro">スクリーンショットからカードを切り抜き、1位から30位までを1枚にまとめます。</p>
        </div>
        <div class="privacy"><span class="privacy-dot"></span>画像はこのブラウザ内で処理されます</div>
      </header>

      <section class="panel upload-panel" aria-labelledby="upload-heading">
        <div class="section-heading">
          <div><span class="step">01</span><h2 id="upload-heading">画像を追加</h2></div>
          <span class="muted" id="source-count">0枚選択済み</span>
        </div>
        <label class="dropzone" id="dropzone" for="file-input">
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          <span class="upload-icon" aria-hidden="true">＋</span>
          <strong>画像を選択、またはここにドロップ</strong>
          <span>PNG・JPEG・WebP / 複数枚をまとめて選択できます</span>
        </label>
        <div id="source-list" class="source-list empty-note">追加した画像がここに表示されます。</div>
      </section>

      <section class="workspace-grid">
        <section class="panel editor-panel" aria-labelledby="editor-heading">
          <div class="section-heading">
            <div><span class="step">02</span><h2 id="editor-heading">カードを登録</h2></div>
          </div>
          <p class="help">画像を選び、カードの範囲をドラッグして順位を登録します。カードは元画像の解像度で保存します。</p>
          <div class="crop-stage empty-stage" id="crop-stage">
            <div class="stage-placeholder">先にランキング画像を追加してください</div>
            <img id="crop-image" alt="選択中のスクリーンショット" hidden />
            <canvas id="crop-overlay" aria-label="切り抜く範囲をドラッグで選択"></canvas>
          </div>
          <div class="crop-controls">
            <label class="field-label" for="rank-select">このカードの順位</label>
            <select id="rank-select" disabled></select>
            <button class="button button-primary" id="add-card" disabled>選択範囲を登録</button>
          </div>
          <p class="status-line" id="editor-status" aria-live="polite">画像を追加すると切り抜きできます。</p>
        </section>

        <section class="panel entries-panel" aria-labelledby="entries-heading">
          <div class="section-heading">
            <div><span class="step">03</span><h2 id="entries-heading">ランキング一覧</h2></div>
            <strong id="entry-count" class="count-pill">0 / 30</strong>
          </div>
          <p class="help">順位を変更すると一覧とプレビューに反映されます。同じ順位への登録は新しいカードに置き換わります。</p>
          <div class="entry-list" id="entry-list"></div>
          <div class="missing-summary" id="missing-summary"></div>
        </section>
      </section>

      <section class="panel preview-panel" aria-labelledby="preview-heading">
        <div class="section-heading preview-heading">
          <div><span class="step">04</span><h2 id="preview-heading">完成プレビュー</h2></div>
          <button class="button button-primary" id="download" disabled>PNGを保存</button>
        </div>
        <p class="help">左列が1〜10位、中央列が11〜20位、右列が21〜30位です。未登録の順位は黒い枠で表示します。</p>
        <div class="preview-wrap" id="preview-wrap"><div class="preview-empty">カードを登録すると30枠のプレビューが表示されます。</div></div>
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
  const cropStage = query<HTMLDivElement>(root, '#crop-stage');
  const cropImage = query<HTMLImageElement>(root, '#crop-image');
  const overlay = query<HTMLCanvasElement>(root, '#crop-overlay');
  const rankSelect = query<HTMLSelectElement>(root, '#rank-select');
  const addButton = query<HTMLButtonElement>(root, '#add-card');
  const editorStatus = query<HTMLParagraphElement>(root, '#editor-status');
  const entryList = query<HTMLDivElement>(root, '#entry-list');
  const missingSummary = query<HTMLDivElement>(root, '#missing-summary');
  const previewWrap = query<HTMLDivElement>(root, '#preview-wrap');
  const downloadButton = query<HTMLButtonElement>(root, '#download');
  const freshnessStatus = query<HTMLSpanElement>(root, '#freshness-status');
  const freshnessButton = query<HTMLButtonElement>(root, '#check-freshness');
  let activeSource: ImageSource | null = null;
  let selection: { x: number; y: number; width: number; height: number } | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let generation = 0;

  rankSelect.innerHTML = Array.from({ length: LAST_RANK }, (_, index) => `<option value="${index + 1}">${index + 1}位</option>`).join('');

  freshnessButton.addEventListener('click', () => void checkFreshness());
  void checkFreshness();

  input.addEventListener('change', () => {
    if (input.files) addFiles(input.files);
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
    if (transfer?.files) addFiles(transfer.files);
  });

  overlay.addEventListener('pointerdown', (event) => {
    if (!activeSource || !cropImage.complete) return;
    const point = localPoint(event);
    dragStart = point;
    selection = { ...point, width: 0, height: 0 };
    overlay.setPointerCapture(event.pointerId);
    drawSelection();
  });
  overlay.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const point = localPoint(event);
    selection = {
      x: Math.min(dragStart.x, point.x), y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y),
    };
    drawSelection();
  });
  overlay.addEventListener('pointerup', () => {
    dragStart = null;
    if (selection && selection.width >= 12 && selection.height >= 12) {
      editorStatus.textContent = `切り抜き範囲を選択しました (${Math.round(selection.width)} × ${Math.round(selection.height)} px)`;
      addButton.disabled = false;
    } else {
      selection = null;
      addButton.disabled = true;
      drawSelection();
    }
  });
  cropImage.addEventListener('load', sizeOverlay);
  window.addEventListener('resize', sizeOverlay);

  addButton.addEventListener('click', async () => {
    if (!activeSource || !selection || !validateRank(Number(rankSelect.value))) return;
    const rank = Number(rankSelect.value);
    const scaleX = cropImage.naturalWidth / cropImage.clientWidth;
    const scaleY = cropImage.naturalHeight / cropImage.clientHeight;
    const rect = {
      x: Math.max(0, Math.floor(selection.x * scaleX)),
      y: Math.max(0, Math.floor(selection.y * scaleY)),
      width: Math.min(cropImage.naturalWidth, Math.ceil(selection.width * scaleX)),
      height: Math.min(cropImage.naturalHeight, Math.ceil(selection.height * scaleY)),
    };
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(rect.width, cropImage.naturalWidth - rect.x);
    canvas.height = Math.min(rect.height, cropImage.naturalHeight - rect.y);
    const context = canvas.getContext('2d');
    if (!context || canvas.width < 1 || canvas.height < 1) return;
    context.drawImage(cropImage, rect.x, rect.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const quality = canvas.width * canvas.height;
    const crop = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.width = 0;
    canvas.height = 0;
    if (!crop) {
      editorStatus.textContent = '切り抜き画像を作成できませんでした。';
      return;
    }
    const previous = entries.get(rank);
    if (previous) URL.revokeObjectURL(previous.cropUrl);
    const entry: RankingEntry = {
      id: crypto.randomUUID(), rank, sourceId: activeSource.id, sourceName: activeSource.file.name,
      capturedAt: activeSource.capturedAt, crop, cropUrl: URL.createObjectURL(crop),
      quality, confidence: null, duplicateCount: 1,
    };
    entries.set(rank, entry);
    selection = null;
    drawSelection();
    addButton.disabled = true;
    editorStatus.textContent = `${rank}位に登録しました。`;
    renderEntries();
    void renderPreview();
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
      editorStatus.textContent = 'PNGを保存しました。';
    } catch (error) {
      editorStatus.textContent = error instanceof Error ? error.message : 'PNG生成に失敗しました。';
    } finally {
      downloadButton.textContent = 'PNGを保存';
      downloadButton.disabled = false;
    }
  });

  function addFiles(fileList: FileList): void {
    const accepted = [...fileList].filter((file) => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
    const rejected = fileList.length - accepted.length;
    for (const file of accepted) {
      const id = crypto.randomUUID();
      sources.set(id, { id, file, url: URL.createObjectURL(file), capturedAt: parseImageDate(file.name, file.lastModified) });
    }
    renderSources();
    if (accepted.length) selectSource([...sources.values()].at(-accepted.length)!);
    editorStatus.textContent = rejected ? `${rejected}件は対応していない形式のため追加しませんでした。` : `${accepted.length}枚を追加しました。`;
  }

  function renderSources(): void {
    query<HTMLElement>(root, '#source-count').textContent = `${sources.size}枚選択済み`;
    sourceList.classList.toggle('empty-note', sources.size === 0);
    if (!sources.size) {
      sourceList.textContent = '追加した画像がここに表示されます。';
      return;
    }
    sourceList.innerHTML = [...sources.values()].map((source) => `
      <button class="source-card ${activeSource?.id === source.id ? 'selected' : ''}" data-source="${source.id}" type="button" title="${escapeHtml(source.file.name)}を切り抜き対象にする">
        <img src="${source.url}" alt="" loading="lazy" />
        <span class="source-info"><strong>${escapeHtml(source.file.name)}</strong><small>${formatCaptureDate(source.capturedAt)}</small></span>
        <span class="source-remove" data-remove="${source.id}" aria-label="画像を削除">×</span>
      </button>`).join('');
    sourceList.querySelectorAll<HTMLButtonElement>('[data-source]').forEach((button) => button.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const source = sources.get(button.dataset.source!);
      if (!source) return;
      if (target.closest('[data-remove]')) {
        removeSource(source);
      } else selectSource(source);
    }));
  }

  function removeSource(source: ImageSource): void {
    sources.delete(source.id);
    URL.revokeObjectURL(source.url);
    for (const [rank, entry] of entries) if (entry.sourceId === source.id) {
      URL.revokeObjectURL(entry.cropUrl);
      entries.delete(rank);
    }
    if (activeSource?.id === source.id) {
      activeSource = null;
      cropImage.hidden = true;
      cropStage.classList.add('empty-stage');
      cropStage.querySelector('.stage-placeholder')!.textContent = '画像を選択してください';
      rankSelect.disabled = true;
      addButton.disabled = true;
      selection = null;
      drawSelection();
    }
    renderSources();
    renderEntries();
    void renderPreview();
  }

  function selectSource(source: ImageSource): void {
    activeSource = source;
    selection = null;
    cropStage.classList.remove('empty-stage');
    cropImage.hidden = false;
    cropImage.src = source.url;
    rankSelect.disabled = false;
    addButton.disabled = true;
    editorStatus.textContent = 'カード部分をドラッグして選択してください。';
    renderSources();
    if (cropImage.complete) sizeOverlay();
  }

  function localPoint(event: PointerEvent): { x: number; y: number } {
    const bounds = overlay.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(cropImage.clientWidth, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(cropImage.clientHeight, event.clientY - bounds.top)),
    };
  }

  function sizeOverlay(): void {
    if (!cropImage.naturalWidth) return;
    overlay.width = cropImage.clientWidth;
    overlay.height = cropImage.clientHeight;
    overlay.style.width = `${cropImage.clientWidth}px`;
    overlay.style.height = `${cropImage.clientHeight}px`;
    drawSelection();
  }

  function drawSelection(): void {
    const context = overlay.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, overlay.width, overlay.height);
    if (!selection) return;
    context.fillStyle = 'rgba(20, 25, 37, .38)';
    context.fillRect(0, 0, overlay.width, overlay.height);
    context.clearRect(selection.x, selection.y, selection.width, selection.height);
    context.strokeStyle = '#a99bff';
    context.lineWidth = 2;
    context.setLineDash([7, 4]);
    context.strokeRect(selection.x, selection.y, selection.width, selection.height);
  }

  function renderEntries(): void {
    const sorted = [...entries.values()].sort((a, b) => a.rank - b.rank);
    query<HTMLElement>(root, '#entry-count').textContent = `${entries.size} / 30`;
    missingSummary.innerHTML = getMissingRanks(entries.values()).length
      ? `<span>未登録 ${getMissingRanks(entries.values()).length}件:</span> ${getMissingRanks(entries.values()).join('・')}位`
      : '<span class="complete-label">30位まで登録済み</span>';
    if (!sorted.length) {
      entryList.innerHTML = '<div class="list-empty">登録したカードがここに並びます。</div>';
      return;
    }
    entryList.innerHTML = sorted.map((entry) => `
      <div class="entry-row" data-entry="${entry.rank}">
        <img src="${entry.cropUrl}" alt="${entry.rank}位の切り抜き" />
        <div class="entry-meta"><strong>${entry.rank}位</strong><small title="${escapeHtml(entry.sourceName)}">${escapeHtml(entry.sourceName)}</small><small>${formatCaptureDate(entry.capturedAt)} · ${entry.duplicateCount}候補</small></div>
        <select aria-label="${entry.rank}位の順位変更" data-change-rank="${entry.rank}">${Array.from({ length: LAST_RANK }, (_, i) => `<option value="${i + 1}" ${i + 1 === entry.rank ? 'selected' : ''}>${i + 1}位</option>`).join('')}</select>
        <button type="button" class="icon-button" data-delete="${entry.rank}" aria-label="${entry.rank}位を削除">削除</button>
      </div>`).join('');
    entryList.querySelectorAll<HTMLSelectElement>('[data-change-rank]').forEach((select) => select.addEventListener('change', () => {
      const oldRank = Number(select.dataset.changeRank);
      const newRank = Number(select.value);
      const entry = entries.get(oldRank);
      if (!entry || !validateRank(newRank)) return;
      const replaced = entries.get(newRank);
      if (replaced && replaced !== entry) URL.revokeObjectURL(replaced.cropUrl);
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
    const current = ++generation;
    downloadButton.disabled = entries.size === 0;
    if (!entries.size) {
      previewWrap.innerHTML = '<div class="preview-empty">カードを登録すると30枠のプレビューが表示されます。</div>';
      return;
    }
    previewWrap.innerHTML = '<div class="preview-empty">プレビューを更新中…</div>';
    try {
      const canvas = await composeRanking(entries);
      if (current !== generation) return;
      canvas.className = 'ranking-preview';
      previewWrap.replaceChildren(canvas);
    } catch {
      if (current === generation) previewWrap.innerHTML = '<div class="preview-empty">プレビューを更新できませんでした。</div>';
    }
  }

  function filenameDate(): string {
    const latest = [...entries.values()].map((entry) => entry.capturedAt).filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${latest.getFullYear()}-${pad(latest.getMonth() + 1)}-${pad(latest.getDate())}_${pad(latest.getHours())}${pad(latest.getMinutes())}${pad(latest.getSeconds())}`;
  }

  async function checkFreshness(): Promise<void> {
    freshnessButton.disabled = true;
    freshnessStatus.textContent = 'GitHubの最新コミットを確認中…';
    freshnessStatus.dataset.state = 'checking';
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, {
        cache: 'no-store',
      });
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
      freshnessStatus.textContent = '最新状態を確認できません（通信後に再確認してください）';
      freshnessStatus.dataset.state = 'unknown';
    } finally {
      freshnessButton.disabled = false;
    }
  }

  renderSources();
  renderEntries();
}

function formatBuildTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'コミット日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo',
  }).format(date);
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
