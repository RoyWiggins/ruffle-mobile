// Flashpoint browser UI.
//
// Manages the search panel and download overlay.  Wired up by main.js via
// initFlashpointBrowser({ onLoad, onToast }).
//
// onLoad(buf: ArrayBuffer, title: string, launchCommand: string|null) → void
//   Called once a zip is fully downloaded; caller unzips and plays it.
// onToast(msg: string, ms?: number) → void

import { searchGames, getGameInfo, downloadZip } from './flashpoint-search.js';

export function initFlashpointBrowser({ onLoad, onToast }) {
  // ---------- DOM refs ----------
  const panel          = document.getElementById('fp-panel');
  const closeBtn       = document.getElementById('fp-panel-close');
  const searchInput    = document.getElementById('fp-search-input');
  const searchBtn      = document.getElementById('fp-search-btn');
  const resultsList    = document.getElementById('fp-results');
  const moreWrap       = document.getElementById('fp-results-more');
  const loadMoreBtn    = document.getElementById('fp-load-more-btn');
  const emptyMsg       = document.getElementById('fp-results-empty');
  const errorMsg       = document.getElementById('fp-results-error');
  const statusMsg      = document.getElementById('fp-search-status');
  const dlOverlay      = document.getElementById('fp-download');
  const dlTitle        = document.getElementById('fp-download-name');
  const dlBar          = document.getElementById('fp-download-bar');
  const dlPct          = document.getElementById('fp-download-pct');
  const dlStage        = document.getElementById('fp-download-stage');
  const dlCancelBtn    = document.getElementById('fp-download-cancel');

  // Wire every element with class fp-browse-trigger to open the panel.
  for (const el of document.querySelectorAll('.fp-browse-trigger')) {
    el.addEventListener('click', open);
  }

  let currentQuery = '';
  let currentPage  = 0;
  let totalResults = 0;
  let searching    = false;
  let dlAbort      = null; // AbortController for in-flight download

  // ---------- Panel open / close ----------

  function open() {
    panel.hidden = false;
    searchInput.focus();
  }

  function close() {
    panel.hidden = true;
  }

  closeBtn.addEventListener('click', close);

  // Close on Escape.
  panel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
  });

  // ---------- Search ----------

  function triggerSearch() {
    const q = searchInput.value.trim();
    if (q) runSearch(q, 1);
  }

  searchBtn.addEventListener('click', triggerSearch);
  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') triggerSearch();
  });
  loadMoreBtn.addEventListener('click', () => runSearch(currentQuery, currentPage + 1));

  async function runSearch(query, page) {
    if (searching) return;
    searching = true;
    searchBtn.disabled = true;
    loadMoreBtn.disabled = true;

    if (page === 1) {
      resultsList.innerHTML = '';
      emptyMsg.hidden  = true;
      errorMsg.hidden  = true;
      moreWrap.hidden  = true;
    }

    statusMsg.hidden = false;
    statusMsg.textContent = page === 1 ? 'Searching…' : 'Loading more…';

    try {
      const { results, total } = await searchGames(query, page);
      currentQuery = query;
      currentPage  = page;
      totalResults = total;

      statusMsg.hidden = true;

      if (page === 1 && results.length === 0) {
        emptyMsg.hidden = false;
      } else {
        for (const r of results) resultsList.appendChild(makeTile(r));
        moreWrap.hidden = resultsList.children.length >= totalResults;
      }
    } catch (err) {
      statusMsg.hidden = true;
      errorMsg.textContent = 'Search failed: ' + err.message;
      errorMsg.hidden = false;
    } finally {
      searching = false;
      searchBtn.disabled = false;
      loadMoreBtn.disabled = false;
    }
  }

  // ---------- Result tile ----------

  function makeTile(game) {
    const tile = document.createElement('div');
    tile.className = 'fp-tile';
    tile.setAttribute('role', 'listitem');
    tile.tabIndex = 0;

    const img = document.createElement('img');
    img.className = 'fp-tile-img';
    img.alt = '';
    img.loading = 'lazy';
    // Logo from infinity.unstable.life loads fine as a plain <img>.
    if (game.logoUrl) img.src = game.logoUrl;
    tile.appendChild(img);

    const titleEl = document.createElement('div');
    titleEl.className = 'fp-tile-title';
    titleEl.textContent = game.title;
    tile.appendChild(titleEl);

    const select = () => selectGame(game);
    tile.addEventListener('click', select);
    tile.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') select(); });

    return tile;
  }

  // ---------- Game selection → download → load ----------

  async function selectGame(game) {
    close();

    dlTitle.textContent = game.title;
    setProgress(null, 'Fetching game info…');
    dlOverlay.hidden = false;

    dlAbort = new AbortController();
    dlCancelBtn.onclick = cancelDownload;

    try {
      // Step 1: resolve zip URL from game detail page.
      const { zipUrl, launchCommand } = await getGameInfo(game.id);
      if (dlAbort.signal.aborted) return;

      if (!zipUrl) throw new Error('No download available for this game');

      // Step 2: stream zip through proxy.
      setProgress(0, 'Downloading…');
      const buf = await downloadZip(zipUrl, (p) => setProgress(p), dlAbort.signal);
      if (dlAbort.signal.aborted) return;

      dlOverlay.hidden = true;
      onLoad(buf, game.title, launchCommand);
    } catch (err) {
      if (err.name === 'AbortError') return;
      dlOverlay.hidden = true;
      onToast('Download failed: ' + err.message, 4000);
    } finally {
      dlAbort = null;
    }
  }

  function cancelDownload() {
    dlAbort?.abort();
    dlOverlay.hidden = true;
  }

  dlCancelBtn.addEventListener('click', cancelDownload);

  function setProgress(fraction, stage) {
    if (stage !== undefined) dlStage.textContent = stage;
    if (fraction === null) {
      // Indeterminate
      dlBar.style.width = '0%';
      dlBar.classList.add('indeterminate');
      dlPct.textContent = '';
    } else {
      dlBar.classList.remove('indeterminate');
      dlBar.style.width = (fraction * 100).toFixed(1) + '%';
      dlPct.textContent = Math.round(fraction * 100) + '%';
    }
  }
}
