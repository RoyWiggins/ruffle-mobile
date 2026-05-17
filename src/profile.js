// Profile schema, defaults, hashing, and localStorage persistence.

import { KEY_SPECS, ACTION_SPECS } from './keys.js';

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
        start:  ACTION_SPECS.Menu,
        select: ACTION_SPECS.Pause,
      },
      axes: {
        left_stick:  { mode: 'dpad',  deadzone_enter: 0.5, deadzone_exit: 0.35 },
        right_stick: { mode: 'off',   deadzone: 0.18, radius: 1.2, accel: 8, maxSpeed: 20, friction: 0.15 },
      },
      touch: {
        enabled: 'auto',
        opacity: 0.6,
        layouts: defaultTouchLayouts(),
      },
      display: {
        align: 'center',
        // Additional per-orientation offset, in fractions of the wrapper.
        // Set in edit mode by dragging the game.
        offsets: {
          portrait:  { dx: 0, dy: 0 },
          landscape: { dx: 0, dy: 0 },
        },
        // Multiplier applied on top of the aspect-ratio fit. 1.0 = fit; <1
        // shrinks (useful for games whose declared stage doesn't match what
        // they draw); >1 zooms in.
        zoom: 1.0,
        // 'aspect' = size the player to the SWF's declared aspect ratio.
        // 'fill'   = size the player to the host area; Ruffle handles
        //            internal scaling. Useful for SWFs whose declared stage
        //            misrepresents the drawing area (e.g. Canabalt).
        // 'custom' = use the customAspect WxH below as the player aspect.
        fitMode: 'aspect',
        // Used when fitMode === 'custom'. Width and height are unitless —
        // only the ratio matters.
        customAspect: { width: 640, height: 480 },
        // NB: reservedBottom is global (in localStorage 'fcp:reservedBottom'),
        // not per-profile — it describes a device preference rather than a
        // per-game setting.
        zoomAnchor: 'center',
      },
    },
    detected: null,
  };
}

// Xbox-style ABXY diamond: Y top, X left, B right, A bottom.
// Coordinates are 0–1 fractions of the wrapper (item center). Sizes are
// 0–1 fractions of the smaller wrapper dimension (cqmin).
function portraitLayout() {
  return [
    { id: 'dpad',     type: 'dpad',   x: 0.20, y: 0.72, size: 0.30 },
    { id: 'button_y', type: 'button', x: 0.78, y: 0.72, topExpr: 'calc(72cqh - 12cqw)', size: 0.13, label: 'Y', binding: 'button_y' },
    { id: 'button_x', type: 'button', x: 0.66, y: 0.72, size: 0.13, label: 'X', binding: 'button_x' },
    { id: 'button_b', type: 'button', x: 0.90, y: 0.72, size: 0.13, label: 'B', binding: 'button_b' },
    { id: 'button_a', type: 'button', x: 0.78, y: 0.72, topExpr: 'calc(72cqh + 12cqw)', size: 0.13, label: 'A', binding: 'button_a' },
    { id: 'start',    type: 'button', x: 0.56, y: 0.93, size: 0.07, label: '▶', binding: 'start' },
    { id: 'select',   type: 'button', x: 0.44, y: 0.93, size: 0.07, label: '⦿', binding: 'select' },
  ];
}

function landscapeLayout() {
  return [
    { id: 'dpad',     type: 'dpad',   x: 0.11, y: 0.66, size: 0.32 },
    { id: 'button_y', type: 'button', x: 0.86, y: 0.66, topExpr: 'calc(66cqh - 8cqw)', size: 0.13, label: 'Y', binding: 'button_y' },
    { id: 'button_x', type: 'button', x: 0.78, y: 0.66, size: 0.13, label: 'X', binding: 'button_x' },
    { id: 'button_b', type: 'button', x: 0.94, y: 0.66, size: 0.13, label: 'B', binding: 'button_b' },
    { id: 'button_a', type: 'button', x: 0.86, y: 0.66, topExpr: 'calc(66cqh + 8cqw)', size: 0.13, label: 'A', binding: 'button_a' },
    { id: 'start',    type: 'button', x: 0.54, y: 0.92, size: 0.07, label: '▶', binding: 'start' },
    { id: 'select',   type: 'button', x: 0.46, y: 0.92, size: 0.07, label: '⦿', binding: 'select' },
  ];
}

export function defaultTouchLayouts() {
  return { portrait: portraitLayout(), landscape: landscapeLayout() };
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
    migrateInPlace(parsed);
    return parsed;
  } catch (err) {
    console.warn('[fcp] failed to load profile', err);
    return null;
  }
}

// Forward-migrate older v1 profiles that predate the per-orientation layout
// split. The schema version is the same; this is a within-v1 field rename.
function migrateInPlace(profile) {
  const touch = profile?.profile?.touch;
  if (touch && !touch.layouts) {
    const old = Array.isArray(touch.layout) ? touch.layout : null;
    touch.layouts = old
      ? { portrait: old, landscape: old.map((it) => ({ ...it })) }
      : defaultTouchLayouts();
    delete touch.layout;
  }
  const display = profile?.profile?.display;
  if (display && display.reservedBottom) {
    // Promoted to a global setting; strip from per-profile storage.
    delete display.reservedBottom;
  }
  const axes = profile?.profile?.axes;
  if (axes && !axes.right_stick) {
    axes.right_stick = { mode: 'off', deadzone: 0.18, radius: 1.2, accel: 8, maxSpeed: 20, friction: 0.15 };
  } else if (axes?.right_stick) {
    const rs = axes.right_stick;
    if (rs.accel == null) rs.accel = 8;
    if (rs.maxSpeed == null) rs.maxSpeed = 20;
    if (rs.friction == null) rs.friction = 0.15;
  }
  if (display && display.zoomAnchor == null) {
    display.zoomAnchor = 'center';
  }
  // Migrate pre-action profiles: if start/select are still the old keyboard
  // defaults, replace them with the new action bindings.
  const gp = profile?.profile?.gamepad;
  if (gp) {
    if (gp.start?.code === 'Enter')  gp.start  = ACTION_SPECS.Menu;
    if (gp.select?.code === 'Escape') gp.select = ACTION_SPECS.Pause;
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
