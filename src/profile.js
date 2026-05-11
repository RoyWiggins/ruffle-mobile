// Profile schema, defaults, hashing, and localStorage persistence.

import { KEY_SPECS } from './keys.js';

export const SCHEMA_VERSION = 1;
const STORAGE_PREFIX = 'fcp:profile:';
const DEFAULT_KEY = 'fcp:profile:__default__';

// Build the v1 default profile.
export function defaultProfile() {
  return {
    schema_version: SCHEMA_VERSION,
    swf_sha256: null,
    label: 'Default',
    profile: {
      gamepad: {
        dpad_up:    KEY_SPECS.ArrowUp,
        dpad_down:  KEY_SPECS.ArrowDown,
        dpad_left:  KEY_SPECS.ArrowLeft,
        dpad_right: KEY_SPECS.ArrowRight,
        // Left stick is converted to digital arrows and uses these
        // (kept separate so a binding ref-count works correctly).
        left_stick_up:    KEY_SPECS.ArrowUp,
        left_stick_down:  KEY_SPECS.ArrowDown,
        left_stick_left:  KEY_SPECS.ArrowLeft,
        left_stick_right: KEY_SPECS.ArrowRight,
        button_a: KEY_SPECS.Space,
        button_b: KEY_SPECS.KeyZ,
        button_x: KEY_SPECS.KeyX,
        button_y: KEY_SPECS.KeyC,
        button_lb: KEY_SPECS.KeyQ,
        button_rb: KEY_SPECS.KeyE,
        button_lt: null,
        button_rt: null,
        start: KEY_SPECS.Enter,
        select: KEY_SPECS.Escape,
      },
      axes: {
        left_stick: { mode: 'dpad', deadzone_enter: 0.5, deadzone_exit: 0.35 },
      },
      touch: {
        enabled: 'auto',
        opacity: 0.6,
        layout: defaultTouchLayout(),
      },
      display: {
        // 'auto' = top in portrait, center in landscape.
        align: 'auto',
      },
    },
    detected: null,
  };
}

export function defaultTouchLayout() {
  // Coordinates are 0–1 fractions of the wrapper. Sizes are 0–1 fractions of
  // the *smaller* wrapper dimension (cqmin) so the layout stays usable in
  // portrait orientation.
  return [
    { id: 'dpad',     type: 'dpad',   x: 0.18, y: 0.74, size: 0.32 },
    { id: 'button_a', type: 'button', x: 0.88, y: 0.82, size: 0.14, label: 'A', binding: 'button_a' },
    { id: 'button_b', type: 'button', x: 0.72, y: 0.78, size: 0.14, label: 'B', binding: 'button_b' },
    { id: 'button_x', type: 'button', x: 0.72, y: 0.92, size: 0.14, label: 'X', binding: 'button_x' },
    { id: 'button_y', type: 'button', x: 0.88, y: 0.66, size: 0.14, label: 'Y', binding: 'button_y' },
    { id: 'start',    type: 'button', x: 0.56, y: 0.96, size: 0.08, label: '▶', binding: 'start' },
    { id: 'select',   type: 'button', x: 0.44, y: 0.96, size: 0.08, label: '⦿', binding: 'select' },
  ];
}

// SHA-256 of an ArrayBuffer / Uint8Array, returned as hex.
export async function sha256Hex(buffer) {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function storageKey(hash) {
  return hash ? STORAGE_PREFIX + hash : DEFAULT_KEY;
}

export function loadProfile(hash) {
  try {
    const raw = localStorage.getItem(storageKey(hash));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schema_version !== SCHEMA_VERSION) return null;
    return parsed;
  } catch (err) {
    console.warn('[fcp] failed to load profile', err);
    return null;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(storageKey(profile.swf_sha256), JSON.stringify(profile));
  } catch (err) {
    console.warn('[fcp] failed to save profile', err);
  }
}

export function resetProfile(hash, label) {
  const p = defaultProfile();
  p.swf_sha256 = hash;
  if (label) p.label = label;
  saveProfile(p);
  return p;
}

// Return the profile for this SWF, creating from defaults if it doesn't exist.
export function getOrCreateProfile(hash, label) {
  const existing = loadProfile(hash);
  if (existing) {
    if (label && !existing.label) {
      existing.label = label;
      saveProfile(existing);
    }
    return existing;
  }
  return resetProfile(hash, label);
}
