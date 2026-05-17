// Flashpoint browser UI.
//
// Manages the search panel and download overlay.  Wired up by main.js via
// initFlashpointBrowser({ onLoad, onToast }).
//
// onLoad(buf: ArrayBuffer, title: string, launchCommand: string|null) → void
//   Called once a zip is fully downloaded; caller unzips and plays it.
// onToast(msg: string, ms?: number) → void

import { searchGames, getGameInfo, downloadZip } from './flashpoint-search.js';
import { setLegacyServer } from './flashpoint.js';
import { isFavorite, getFavoriteList, toggleFavorite } from './favorites.js';

// onLoad(buf, title, launchCommand)  — caller unzips and plays
// onLoadSwf(buf, title, url)          — caller plays SWF directly (legacy path)
// onToast(msg, ms)
export function initFlashpointBrowser({ onLoad, onLoadSwf, onToast, onSelect }) {
  // ---------- DOM refs ----------
  const panel          = document.getElementById('fp-panel');
  const closeBtn       = document.getElementById('fp-panel-close');
  const searchInput    = document.getElementById('fp-search-input');
  const searchClearBtn = document.getElementById('fp-search-clear');
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
  let searchDebounce = null;

  // ---------- Panel open / close ----------

  function open() {
    panel.hidden = false;
    searchInput.focus();
    if (!searchInput.value.trim()) showFavorites();
  }

  function close({ clearUrl = true } = {}) {
    panel.hidden = true;
    if (clearUrl) history.replaceState(null, '', location.pathname);
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
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    searchClearBtn.hidden = !searchInput.value;
    if (!q) { showFavorites(); return; }
    searchDebounce = setTimeout(() => runSearch(q, 1), 700);
  });
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.hidden = true;
    searchInput.focus();
    showFavorites();
  });
  loadMoreBtn.addEventListener('click', () => runSearch(currentQuery, currentPage + 1));

  document.getElementById('fp-filter-row').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.fp-filter-btn');
    if (!btn) return;
    searchInput.value = btn.dataset.query;
    searchClearBtn.hidden = !searchInput.value;
    triggerSearch();
  });

  function showFavorites() {
    resultsList.innerHTML = '';
    emptyMsg.hidden  = true;
    errorMsg.hidden  = true;
    moreWrap.hidden  = true;
    statusMsg.hidden = true;
    const favs = getFavoriteList();
    if (favs.length === 0) {
      emptyMsg.textContent = 'No favorites yet. Star a game to add it here.';
      emptyMsg.hidden = false;
    } else {
      for (const f of favs) resultsList.appendChild(makeTile(f));
    }
  }

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
      // Update URL with search query.
      history.replaceState(null, '', '?s=' + encodeURIComponent(query));
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
        // Put favorited games first.
        if (page === 1) {
          results.sort((a, b) => {
            const af = isFavorite(a.id) ? 0 : 1;
            const bf = isFavorite(b.id) ? 0 : 1;
            return af - bf;
          });
        }
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

    // Favorite star button
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'fp-tile-fav' + (isFavorite(game.id) ? ' is-fav' : '');
    favBtn.textContent = isFavorite(game.id) ? '★' : '☆';
    favBtn.title = 'Toggle favorite';
    favBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleFavorite(game.id, { title: game.title, logoUrl: game.logoUrl });
      const faved = isFavorite(game.id);
      favBtn.textContent = faved ? '★' : '☆';
      favBtn.classList.toggle('is-fav', faved);
    });
    tile.appendChild(favBtn);

    const select = () => selectGame(game);
    tile.addEventListener('click', select);
    tile.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') select(); });

    return tile;
  }

  // ---------- Game selection → download → load ----------

  async function selectGame(game) {
    history.replaceState(null, '', '?fp=' + encodeURIComponent(game.id));
    close({ clearUrl: false });
    onSelect?.(game);

    dlTitle.textContent = game.title;
    setProgress(null, 'Fetching game info…');
    dlOverlay.hidden = false;

    dlAbort = new AbortController();
    dlCancelBtn.onclick = cancelDownload;

    try {
      // Step 1: resolve zip URL (or legacy-server fallback) from game detail page.
      const { zipUrl, launchCommand, legacyServer } = await getGameInfo(game.id);
      if (dlAbort.signal.aborted) return;

      if (zipUrl) {
        // Normal path: stream the full zip.
        await setLegacyServer(null); // no legacy fallback for zip games
        setProgress(0, 'Downloading…');
        const buf = await downloadZip(zipUrl, (p) => setProgress(p), dlAbort.signal);
        if (dlAbort.signal.aborted) return;
        dlOverlay.hidden = true;
        onLoad(buf, game.title, launchCommand);
      } else if (legacyServer && launchCommand) {
        // Legacy path: no zip — fetch just the main SWF from the legacy server.
        // Register the server in the cache so the SW proxies ALL ancillary
        // cross-origin requests (level SWFs, assets, etc.) through it.
        await setLegacyServer(legacyServer);
        setProgress(null, 'Downloading…');
        const swfUrl = new URL(launchCommand);
        const legacyUrl = legacyServer.replace(/\/$/, '')
          + '/' + swfUrl.hostname + swfUrl.pathname;
        const res = await fetch(
          'https://scratch-blnn7.sprites.app/cors-proxy/?url=' + encodeURIComponent(legacyUrl),
          { signal: dlAbort.signal },
        );
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const buf = await res.arrayBuffer();
        if (dlAbort.signal.aborted) return;
        dlOverlay.hidden = true;
        onLoadSwf(buf, game.title, launchCommand);
      } else {
        throw new Error('No download available for this game');
      }
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

  return {
    open,
    // Load a Flashpoint game by UUID directly, skipping the search UI.
    // Used by the deep-link boot path.
    loadById: (id) => selectGame({ id, title: '' }),
    // Open the panel and immediately search for the given query.
    searchFor(query) {
      open();
      searchInput.value = query;
      searchClearBtn.hidden = !query;
      runSearch(query, 1);
    },
  };
}
