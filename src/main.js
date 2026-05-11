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
  const hash = await sha256Hex(buf);
  currentProfile = getOrCreateProfile(hash, label);

  if (!ruffleInstance) ruffleInstance = await ensureRuffle();

  // Tear down a previous player.
  if (player) {
    try { player.remove(); } catch (_) {}
    player = null;
  }

  player = ruffleInstance.createPlayer();
  player.style.width = '100%';
  player.style.height = '100%';
  ruffleHost.innerHTML = '';
  ruffleHost.appendChild(player);

  await player.load({ data: buf });
  wrapper.classList.add('has-swf');
  input.setHost(player);

  try { player.focus({ preventScroll: true }); } catch (_) {}
  wrapper.focus({ preventScroll: true });

  applyProfile();
  showToast(`Loaded · profile ${hash.slice(0, 8)}`);
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

function toggleTouchEdit() {
  const editing = !touch.editing;
  touch.setEditing(editing);
  if (editing) showToast('Drag overlay buttons to reposition. Toggle off when done.', 3500);
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
  if (player) try { player.focus({ preventScroll: true }); } catch (_) {}
});

// Boot
applyProfile();
applyTouchVisibility();
gp.start();
ensureRuffle().catch(err => {
  console.error(err);
  showToast('Ruffle failed to load: ' + err.message, 5000);
});
