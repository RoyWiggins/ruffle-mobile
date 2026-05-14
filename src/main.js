// Entry point. Wires the SWF loader, Ruffle player, input dispatcher,
// gamepad polling, touch overlay, and settings panel together.

import {
  defaultProfile, sha256Hex, getOrCreateProfile,
  saveProfile, resetProfile,
} from './profile.js';
import { InputDispatcher } from './input.js';
import { GamepadHandler } from './gamepad.js';
import { TouchOverlay } from './touch.js';
import { SettingsUI } from './ui.js';
import { readSwfDimensions } from './swf.js';
import {
  isFlashpointZip, loadFlashpointArchive, clearFlashpointCache, setLegacyServer,
} from './flashpoint.js';
import { initFlashpointBrowser } from './flashpoint-browser.js';

const wrapper       = document.getElementById('player-wrapper');
const ruffleHost    = document.getElementById('ruffle-host');
const touchEl       = document.getElementById('touch-overlay');
const toast         = document.getElementById('toast');
const fileInput     = document.getElementById('file-input');
const urlInput      = document.getElementById('url-input');
const loadUrlBtn    = document.getElementById('load-url-btn');
const demoBtn       = document.getElementById('demo-btn');
const loaderEl     = document.getElementById('loader');
const currentSwfEl = document.getElementById('current-swf');
const swfNameEl    = currentSwfEl.querySelector('.swf-name');
const inputModeEl   = document.getElementById('input-mode');
const settingsBtn   = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const muteBtn = document.getElementById('mute-btn');

let currentProfile = defaultProfile();
let ruffleInstance = null;
let player = null;
let inputModeTimer = null;
let swfDimensions = null; // { width, height } or null

const input = new InputDispatcher();
input.onAction = handleAction;
const gp = new GamepadHandler(input, getCurrentProfile, onInputActivity);
const touch = new TouchOverlay(touchEl, input, getCurrentProfile, persistProfile, onInputActivity, currentOrientation);
const ui = new SettingsUI({
  panelEl: settingsPanel,
  getProfile: getCurrentProfile,
  saveProfile: persistProfile,
  onChange: applyProfile,
  onTouchEdit: toggleTouchEdit,
  onReset: doReset,
  getOrientation: currentOrientation,
  getReservedBottom: (o) => globalReserved[o] || 0,
  setReservedBottom,
});

function getCurrentProfile() { return currentProfile; }

function persistProfile() {
  if (currentProfile.swf_sha256) saveProfile(currentProfile);
}

function setInputMode(mode) {
  inputModeEl.dataset.mode = mode;
  inputModeEl.textContent = mode === 'gamepad' ? '🎮' : mode === 'touch' ? '👆' : '⌨';
  inputModeEl.classList.add('active');
  clearTimeout(inputModeTimer);
  inputModeTimer = setTimeout(() => inputModeEl.classList.remove('active'), 1500);
}

function onInputActivity(mode) { setInputMode(mode); }

function applyProfile() {
  // Release everything currently held — bindings may have changed.
  input.releaseAll();
  input.setAimRadius(currentProfile.profile.axes?.right_stick?.radius ?? 1.2);
  touch.render();
  applyTouchVisibility();
  fitPlayer();
  if (currentProfile.swf_sha256) {
    swfNameEl.textContent = currentProfile.label || ('Profile ' + currentProfile.swf_sha256.slice(0, 8));
    loaderEl.hidden = true;
    currentSwfEl.hidden = false;
  } else {
    loaderEl.hidden = false;
    currentSwfEl.hidden = true;
  }
}

function applyTouchVisibility() {
  const mode = currentProfile.profile.touch.enabled;
  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;
  const hasGamepad = gp.hasConnected();
  let visible;
  if (mode === 'always') visible = true;
  else if (mode === 'never') visible = false;
  else visible = isCoarse && !hasGamepad;
  touch.setVisible(visible);
}

function showToast(msg, ms = 2200) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, ms);
}

// ---------- Ruffle loading ----------

async function ensureRuffle() {
  // The Ruffle script tag installs window.RufflePlayer asynchronously.
  for (let i = 0; i < 200; i++) {
    if (window.RufflePlayer && window.RufflePlayer.newest) return window.RufflePlayer.newest();
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Ruffle failed to load');
}

async function loadSwfFromBuffer(buf, label, swfUrl = null) {
  wrapper.classList.add('is-loading');
  const [hash, dims] = await Promise.all([
    sha256Hex(buf),
    readSwfDimensions(buf).catch(() => null),
  ]);
  currentProfile = getOrCreateProfile(hash, label);
  swfDimensions = dims;

  if (!ruffleInstance) ruffleInstance = await ensureRuffle();

  // Tear down a previous player.
  if (player) {
    try { player.remove(); } catch (_) {}
    player = null;
  }

  player = ruffleInstance.createPlayer();
  // Disable Ruffle's own letterbox — we size the player to the game aspect
  // and align it ourselves so the user can choose top/center/bottom.
  ruffleHost.innerHTML = '';
  ruffleHost.appendChild(player);

  await player.load({
    data: buf,
    // base tells Ruffle the game's directory URL so relative loadMovie() /
    // Sound() calls resolve to the right origin and the SW can intercept them.
    // 'url' and 'data' are mutually exclusive in Ruffle's load API — when both
    // are present Ruffle uses data mode and silently ignores 'url', so relative
    // assets would resolve against our app's origin instead of the game's.
    ...(swfUrl ? { base: swfUrl.replace(/[^/]+$/, '') } : {}),
    letterbox: 'off',
    contextMenu: 'off', // never show Ruffle's right-click / long-press menu
    autoplay: 'on',     // user already clicked Open/Demo — skip click-to-play
    unmuteOverlay: 'hidden',
  });
  wrapper.classList.add('has-swf');
  wrapper.classList.remove('is-loading');
  input.setHost(player);
  applyMute();
  fitPlayer();

  try { player.focus({ preventScroll: true }); } catch (_) {}
  wrapper.focus({ preventScroll: true });

  applyProfile();
  showToast(`Loaded · profile ${hash.slice(0, 8)}`);
}

function currentOrientation() {
  return wrapper.clientHeight > wrapper.clientWidth ? 'portrait' : 'landscape';
}

function effectiveAlign() {
  const setting = currentProfile.profile.display?.align || 'auto';
  if (setting !== 'auto') return setting;
  return currentOrientation() === 'portrait' ? 'top' : 'center';
}

function getDisplayOffset() {
  const d = currentProfile.profile.display;
  if (!d || !d.offsets) return { dx: 0, dy: 0 };
  return d.offsets[currentOrientation()] || { dx: 0, dy: 0 };
}

function getReservedBottom() {
  return clamp01(globalReserved[currentOrientation()] || 0);
}

function setReservedBottom(orientation, value) {
  globalReserved[orientation] = clamp01(value);
  try { localStorage.setItem('fcp:reservedBottom', JSON.stringify(globalReserved)); } catch (_) {}
  fitPlayer();
}

let globalReserved = (() => {
  try {
    const raw = localStorage.getItem('fcp:reservedBottom');
    if (!raw) return { portrait: 0, landscape: 0 };
    const v = JSON.parse(raw);
    return { portrait: Number(v.portrait) || 0, landscape: Number(v.landscape) || 0 };
  } catch (_) { return { portrait: 0, landscape: 0 }; }
})();

function clamp01(v) { return Math.max(0, Math.min(0.9, v || 0)); }

function setDisplayOffset(dx, dy) {
  const p = currentProfile.profile;
  p.display = p.display || {};
  p.display.offsets = p.display.offsets || {};
  p.display.offsets[currentOrientation()] = { dx, dy };
}

function fitPlayer() {
  if (!player) return;
  const align = effectiveAlign();
  ruffleHost.classList.remove('align-top', 'align-center', 'align-bottom');
  ruffleHost.classList.add('align-' + align);

  // Shrink the host by the reserved-bottom fraction so the player fits and
  // aligns within the remaining area; the strip below is left for controls.
  ruffleHost.style.setProperty('--reserved-bottom', (getReservedBottom() * 100) + '%');

  const hw = ruffleHost.clientWidth;
  const hh = ruffleHost.clientHeight;
  if (hw === 0 || hh === 0) return;
  const zoom = Math.max(0.25, Math.min(4, currentProfile.profile.display?.zoom ?? 1));
  const fitMode = currentProfile.profile.display?.fitMode || 'aspect';

  // Without a parsed SWF size we can't size the canvas natively; fall back
  // to letting Ruffle fill the host. (Custom and Fill modes also don't need
  // the native-canvas trick — they're explicit about wanting Ruffle to
  // scale.)
  const useNative = swfDimensions && fitMode === 'aspect';
  if (!useNative) {
    let w, h;
    if (fitMode === 'fill' || !swfDimensions) {
      w = hw; h = hh;
    } else {
      let aspect = swfDimensions ? swfDimensions.width / swfDimensions.height : 1;
      if (fitMode === 'custom') {
        const c = currentProfile.profile.display?.customAspect;
        if (c && c.width > 0 && c.height > 0) aspect = c.width / c.height;
      }
      const ha = hw / hh;
      if (aspect > ha) { w = hw; h = w / aspect; }
      else             { h = hh; w = h * aspect; }
    }
    w *= zoom; h *= zoom;
    player.style.position = '';
    player.style.top = '';
    player.style.left = '';
    player.style.width = w + 'px';
    player.style.height = h + 'px';
    player.style.transform = '';
    player.style.transformOrigin = '';
    const off = getDisplayOffset();
    const tx = off.dx * hw;
    const ty = off.dy * hh;
    player.style.translate = tx || ty ? `${tx}px ${ty}px` : '';
    return;
  }

  // Native-canvas path: keep the canvas at the SWF's declared pixel size and
  // use a CSS transform for visual fit. Critical for SWFs that set
  // Stage.scaleMode = NO_SCALE (e.g. Flixel games like EZPlatformer) — those
  // read stage.stageWidth and base their own scaling on it, so the canvas
  // must report the SWF's intended dimensions.
  const sw = swfDimensions.width;
  const sh = swfDimensions.height;
  player.style.position = 'absolute';
  player.style.top = '0';
  player.style.left = '0';
  player.style.width = sw + 'px';
  player.style.height = sh + 'px';
  const fit = Math.min(hw / sw, hh / sh) * zoom;
  const vw = sw * fit;
  const vh = sh * fit;
  let topPx;
  if (align === 'top') topPx = 0;
  else if (align === 'bottom') topPx = hh - vh;
  else topPx = (hh - vh) / 2;
  const leftPx = (hw - vw) / 2;
  const off = getDisplayOffset();
  const tx = leftPx + off.dx * hw;
  const ty = topPx  + off.dy * hh;
  player.style.transformOrigin = 'top left';
  player.style.transform = `translate(${tx}px, ${ty}px) scale(${fit})`;
  player.style.translate = '';
}

async function loadFromFile(file) {
  if (isFlashpointZip(file)) {
    await loadFromZip(file);
    return;
  }
  wrapper.classList.add('is-loading');
  try {
    const buf = await file.arrayBuffer();
    await loadSwfFromBuffer(buf, file.name);
  } catch (err) {
    wrapper.classList.remove('is-loading');
    console.error(err);
    showToast('Failed to load file: ' + err.message);
  }
}

async function loadFromZip(file) {
  await loadFromFlashpointBuffer(await file.arrayBuffer(), file.name, null);
}

// Shared entry point used by both file-upload and browser-download paths.
async function loadFromFlashpointBuffer(buf, title, launchCommand) {
  wrapper.classList.add('is-loading');
  showToast('Loading archive…', 30000);
  try {
    const { launchUrl, launchData } = await loadFlashpointArchive(buf, launchCommand);
    const label = title || launchUrl.split('/').pop();
    await loadSwfFromBuffer(launchData, label, launchUrl);
  } catch (err) {
    wrapper.classList.remove('is-loading');
    console.error(err);
    showToast('Failed to load archive: ' + err.message);
  }
}

async function loadFromUrl(url) {
  wrapper.classList.add('is-loading');
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const label = url.split('/').pop()?.split('?')[0] || url;
    await loadSwfFromBuffer(buf, label);
  } catch (err) {
    wrapper.classList.remove('is-loading');
    console.error(err);
    showToast('Failed to load URL: ' + err.message);
  }
}

// ---------- UI wiring ----------

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) loadFromFile(f);
  fileInput.value = '';
});

loadUrlBtn.addEventListener('click', () => {
  const u = urlInput.value.trim();
  if (u) loadFromUrl(u);
});
urlInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    const u = urlInput.value.trim();
    if (u) loadFromUrl(u);
  }
});

settingsBtn.addEventListener('click', () => {
  if (settingsPanel.hidden) ui.open();
  else ui.close();
  settingsBtn.setAttribute('aria-expanded', String(!settingsPanel.hidden));
  applyAutoPause();
});
settingsPanel.querySelector('#settings-close').addEventListener('click', () => {
  ui.close();
  settingsBtn.setAttribute('aria-expanded', 'false');
  applyAutoPause();
});

// Pause Ruffle while the user is in the settings panel, editing the touch
// layout, the page is hidden, or the user has explicitly paused via a binding.
// We track our own pause state so we don't fight with whatever Ruffle is doing
// on its own (e.g. a click-to-play overlay before first interaction).
let pausedByUI = false;
let pausedByButton = false; // toggled by the Pause action binding

function applyAutoPause() {
  if (!player) return;
  const want = !settingsPanel.hidden || touch.editing || document.hidden || pausedByButton;
  if (want && !pausedByUI) {
    try { player.pause?.(); pausedByUI = true; } catch (_) {}
  } else if (!want && pausedByUI) {
    try { player.play?.(); } catch (_) {}
    pausedByUI = false;
  }
}

function handleAction(action) {
  if (action === 'pause') {
    pausedByButton = !pausedByButton;
    applyAutoPause();
  } else if (action === 'menu') {
    if (settingsPanel.hidden) ui.open();
    else ui.close();
    settingsBtn.setAttribute('aria-expanded', String(!settingsPanel.hidden));
    applyAutoPause();
  }
}
document.addEventListener('visibilitychange', applyAutoPause);

fullscreenBtn.addEventListener('click', () => {
  // Fullscreen the wrapper so the touch overlay stays visible over the player.
  if (document.fullscreenElement === wrapper) {
    document.exitFullscreen?.();
  } else {
    wrapper.requestFullscreen?.();
  }
});

// Audio mute, persisted in localStorage so it survives reloads.
let muted = localStorage.getItem('fcp:muted') === '1';
let savedVolume = 1;
function applyMute() {
  if (!player) return;
  if (muted) {
    try {
      const v = player.volume;
      if (typeof v === 'number' && v > 0) savedVolume = v;
    } catch (_) {}
  }
  const target = muted ? 0 : (savedVolume || 1);
  // Ruffle's public API has used different shapes across versions; try them all.
  try { player.volume = target; } catch (_) {}
  try { player.setVolume?.(target); } catch (_) {}
  try { player.set_volume?.(target); } catch (_) {}
  // As a last resort, suspend/resume the AudioContext Ruffle is using.
  try {
    const ctx = player.audioContext || player.getAudioContext?.();
    if (ctx) {
      if (muted) ctx.suspend?.();
      else       ctx.resume?.();
    }
  } catch (_) {}
}
function refreshMuteBtn() {
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.title = muted ? 'Unmute audio' : 'Mute audio';
}
muteBtn.addEventListener('click', () => {
  muted = !muted;
  try { localStorage.setItem('fcp:muted', muted ? '1' : '0'); } catch (_) {}
  applyMute();
  refreshMuteBtn();
});
refreshMuteBtn();

// Belt-and-braces: even with Ruffle's contextMenu config off, suppress the
// browser's own right-click / long-press menu inside the player wrapper.
wrapper.addEventListener('contextmenu', (ev) => ev.preventDefault());

currentSwfEl.addEventListener('click', () => clearSwf());

const emptyStateEl = document.getElementById('empty-state');
demoBtn?.addEventListener('click', async () => {
  demoBtn.disabled = true;
  try {
    await loadFromUrl(new URL('demos/ezplatformer.swf', document.baseURI).toString());
  } finally {
    demoBtn.disabled = false;
  }
});

function clearSwf() {
  if (player) {
    try { player.remove(); } catch (_) {}
    player = null;
  }
  swfDimensions = null;
  pausedByUI = false;
  pausedByButton = false;
  wrapper.classList.remove('has-swf', 'is-loading');
  ruffleHost.innerHTML = '';
  currentProfile = defaultProfile();
  applyProfile();
  clearFlashpointCache().catch(() => {});
  setLegacyServer(null).catch(() => {});
  history.replaceState(null, '', location.pathname);
  showToast('Cleared');
}

let doneEditBtn = null;
let gameScrim = null;

function ensureGameScrim() {
  if (gameScrim) return gameScrim;
  const scrim = document.createElement('div');
  scrim.id = 'game-drag-scrim';
  scrim.hidden = true;
  let drag = null;
  scrim.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try { scrim.setPointerCapture(ev.pointerId); } catch (_) {}
    const off = getDisplayOffset();
    drag = { px: ev.clientX, py: ev.clientY, dx0: off.dx, dy0: off.dy };
  });
  scrim.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = drag.dx0 + (ev.clientX - drag.px) / wrapper.clientWidth;
    const dy = drag.dy0 + (ev.clientY - drag.py) / wrapper.clientHeight;
    setDisplayOffset(dx, dy);
    fitPlayer();
  });
  const onUp = (ev) => {
    if (!drag) return;
    drag = null;
    try { scrim.releasePointerCapture(ev.pointerId); } catch (_) {}
    saveProfile(currentProfile);
  };
  scrim.addEventListener('pointerup', onUp);
  scrim.addEventListener('pointercancel', onUp);
  wrapper.appendChild(scrim);
  gameScrim = scrim;
  return scrim;
}

function toggleTouchEdit() {
  const editing = !touch.editing;
  touch.setEditing(editing);
  if (editing) {
    ui.close();
    settingsBtn.setAttribute('aria-expanded', 'false');
    ensureGameScrim().hidden = false;
    if (!doneEditBtn) {
      doneEditBtn = document.createElement('button');
      doneEditBtn.id = 'done-edit-btn';
      doneEditBtn.type = 'button';
      doneEditBtn.textContent = '✓ Done editing';
      doneEditBtn.addEventListener('click', () => toggleTouchEdit());
      wrapper.appendChild(doneEditBtn);
    }
    doneEditBtn.hidden = false;
    showToast('Drag the game or controls to reposition.', 2500);
  } else {
    if (gameScrim) gameScrim.hidden = true;
    if (doneEditBtn) doneEditBtn.hidden = true;
  }
  applyAutoPause();
}

function doReset() {
  if (!currentProfile.swf_sha256) {
    currentProfile = defaultProfile();
  } else {
    currentProfile = resetProfile(currentProfile.swf_sha256, currentProfile.label);
  }
  applyProfile();
  ui.refresh();
  showToast('Profile reset');
}

// Drag-and-drop a SWF onto the page.
['dragenter', 'dragover'].forEach(t => wrapper.addEventListener(t, (ev) => {
  ev.preventDefault();
  wrapper.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach(t => wrapper.addEventListener(t, (ev) => {
  ev.preventDefault();
  wrapper.classList.remove('drag-over');
}));
wrapper.addEventListener('drop', (ev) => {
  const f = ev.dataTransfer?.files?.[0];
  if (f) loadFromFile(f);
});

// Keep focus on the wrapper so synthetic events have a focused target.
wrapper.addEventListener('pointerdown', () => {
  if (player) try { player.focus({ preventScroll: true }); } catch (_) {}
});

// Release held keys on blur / visibility change so games don't get stuck.
window.addEventListener('blur', () => input.releaseAll());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.releaseAll();
});
window.addEventListener('gamepaddisconnected', () => applyTouchVisibility());
window.addEventListener('gamepadconnected', () => {
  setInputMode('gamepad');
  applyTouchVisibility();
});

// React to fullscreen changes (the touch overlay layout doesn't change,
// but the wrapper resizes, and we want to make sure the player keeps focus).
document.addEventListener('fullscreenchange', () => {
  fitPlayer();
  if (player) try { player.focus({ preventScroll: true }); } catch (_) {}
});

// --touch-base: the screen's smaller dimension. Touch items size themselves
// off of this rather than the wrapper, so going fullscreen (which enlarges
// the wrapper) doesn't grow the d-pad and buttons.
function updateTouchBase() {
  const s = window.screen || {};
  const base = Math.min(
    s.width  || window.innerWidth,
    s.height || window.innerHeight,
  );
  document.documentElement.style.setProperty('--touch-base', base + 'px');
}
updateTouchBase();
window.addEventListener('resize', updateTouchBase);
window.addEventListener('orientationchange', updateTouchBase);

// Re-fit the player on wrapper resize (rotation, window resize), and
// re-render the touch overlay when the orientation flips so it uses the
// right per-orientation layout.
let lastOrientation = currentOrientation();
function onWrapperResize() {
  fitPlayer();
  const o = currentOrientation();
  if (o !== lastOrientation) {
    lastOrientation = o;
    touch.render();
    if (!settingsPanel.hidden) ui.refresh();
  }
}
if (window.ResizeObserver) {
  new ResizeObserver(onWrapperResize).observe(wrapper);
} else {
  window.addEventListener('resize', onWrapperResize);
}

// Boot
applyProfile();
applyTouchVisibility();
gp.start();
const fpBrowser = initFlashpointBrowser({
  onLoad:    (buf, title, launchCommand) => loadFromFlashpointBuffer(buf, title, launchCommand),
  onLoadSwf: (buf, title, url) => loadSwfFromBuffer(buf, title, url).catch(err => {
    wrapper.classList.remove('is-loading');
    showToast('Failed: ' + err.message, 4000);
  }),
  onToast:   showToast,
});

// Deep-link: ?fp=<uuid> auto-loads a Flashpoint game on page open.
const deepLinkId = new URLSearchParams(location.search).get('fp');
if (deepLinkId) fpBrowser.loadById(deepLinkId);

// Service worker patches dead CDN dependencies in old SWFs (e.g. Neopets
// games that loadMovie a now-503ing high-scores wrapper). Only runs on
// HTTPS / localhost — silent no-op elsewhere.
if ('serviceWorker' in navigator) {
  const swUrl = new URL('sw.js', document.baseURI).toString();
  navigator.serviceWorker.register(swUrl).catch(() => {});

  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'fp-fetch') appendNetEntry(ev.data);
  });
}

// ── Network console ──────────────────────────────────────────────────────
const netConsolePanel = document.getElementById('net-console');
const netConsoleLog   = document.getElementById('net-console-log');
const netConsoleBtn   = document.getElementById('net-console-btn');
const netConsoleClear = document.getElementById('net-console-clear');

netConsoleBtn.addEventListener('click', () => {
  const open = netConsolePanel.hidden;
  netConsolePanel.hidden = !open;
  netConsoleBtn.setAttribute('aria-pressed', String(open));
});
netConsoleClear.addEventListener('click', () => { netConsoleLog.innerHTML = ''; });

function appendNetEntry({ url, via, status }) {
  const row = document.createElement('div');
  row.className = 'net-entry';

  const viaEl = document.createElement('span');
  const viaClass = via.startsWith('stub:') ? 'stub' : via;
  viaEl.className = 'net-via net-via-' + viaClass;
  viaEl.textContent = via;

  const statusEl = document.createElement('span');
  const statusOk = status >= 200 && status < 300;
  statusEl.className = 'net-status' + (status === null ? '' : statusOk ? ' net-status-ok' : ' net-status-err');
  statusEl.textContent = status ?? '…';

  const urlEl = document.createElement('span');
  urlEl.className = 'net-url';
  urlEl.textContent = url;
  urlEl.title = url;

  row.appendChild(viaEl);
  row.appendChild(statusEl);
  row.appendChild(urlEl);
  netConsoleLog.appendChild(row);
  netConsoleLog.scrollTop = netConsoleLog.scrollHeight;
}
ensureRuffle().catch(err => {
  console.error(err);
  showToast('Ruffle failed to load: ' + err.message, 5000);
});
