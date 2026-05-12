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

const wrapper       = document.getElementById('player-wrapper');
const ruffleHost    = document.getElementById('ruffle-host');
const touchEl       = document.getElementById('touch-overlay');
const toast         = document.getElementById('toast');
const fileInput     = document.getElementById('file-input');
const urlInput      = document.getElementById('url-input');
const loadUrlBtn    = document.getElementById('load-url-btn');
const profileLabel  = document.getElementById('profile-label');
const inputModeEl   = document.getElementById('input-mode');
const settingsBtn   = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const fullscreenBtn = document.getElementById('fullscreen-btn');

let currentProfile = defaultProfile();
let ruffleInstance = null;
let player = null;
let inputModeTimer = null;
let swfDimensions = null; // { width, height } or null

const input = new InputDispatcher();
const gp = new GamepadHandler(input, getCurrentProfile, onInputActivity);
const touch = new TouchOverlay(touchEl, input, getCurrentProfile, persistProfile, onInputActivity);
const ui = new SettingsUI({
  panelEl: settingsPanel,
  getProfile: getCurrentProfile,
  saveProfile: persistProfile,
  onChange: applyProfile,
  onTouchEdit: toggleTouchEdit,
  onReset: doReset,
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
  touch.render();
  applyTouchVisibility();
  fitPlayer();
  if (!currentProfile.swf_sha256) profileLabel.textContent = 'No SWF loaded';
  else if (currentProfile.label) profileLabel.textContent = currentProfile.label;
  else profileLabel.textContent = 'Profile ' + currentProfile.swf_sha256.slice(0, 8);
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

async function loadSwfFromBuffer(buf, label) {
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

  await player.load({ data: buf, letterbox: 'off' });
  wrapper.classList.add('has-swf');
  input.setHost(player);
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

  if (!swfDimensions) {
    player.style.width = '100%';
    player.style.height = '100%';
    player.style.translate = '';
    return;
  }
  const hw = ruffleHost.clientWidth;
  const hh = ruffleHost.clientHeight;
  if (hw === 0 || hh === 0) return;
  const ga = swfDimensions.width / swfDimensions.height;
  const ha = hw / hh;
  let w, h;
  if (ga > ha) { w = hw; h = w / ga; }
  else         { h = hh; w = h * ga; }
  player.style.width = w + 'px';
  player.style.height = h + 'px';

  const off = getDisplayOffset();
  const tx = off.dx * hw;
  const ty = off.dy * hh;
  player.style.translate = tx || ty ? `${tx}px ${ty}px` : '';
}

async function loadFromFile(file) {
  try {
    const buf = await file.arrayBuffer();
    await loadSwfFromBuffer(buf, file.name);
  } catch (err) {
    console.error(err);
    showToast('Failed to load file: ' + err.message);
  }
}

async function loadFromUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const label = url.split('/').pop()?.split('?')[0] || url;
    await loadSwfFromBuffer(buf, label);
  } catch (err) {
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
});
settingsPanel.querySelector('#settings-close').addEventListener('click', () => {
  ui.close();
  settingsBtn.setAttribute('aria-expanded', 'false');
});

fullscreenBtn.addEventListener('click', () => {
  // Fullscreen the wrapper so the touch overlay stays visible over the player.
  if (document.fullscreenElement === wrapper) {
    document.exitFullscreen?.();
  } else {
    wrapper.requestFullscreen?.();
  }
});

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

// Re-fit the player on wrapper resize (rotation, window resize).
if (window.ResizeObserver) {
  new ResizeObserver(() => fitPlayer()).observe(wrapper);
} else {
  window.addEventListener('resize', fitPlayer);
}

// Boot
applyProfile();
applyTouchVisibility();
gp.start();
ensureRuffle().catch(err => {
  console.error(err);
  showToast('Ruffle failed to load: ' + err.message, 5000);
});
