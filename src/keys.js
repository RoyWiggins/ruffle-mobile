// Keyboard event spec library. Each entry maps to the fields we need to
// dispatch a synthetic KeyboardEvent that Ruffle (and Flash AVM1/AVM2)
// will recognize: key, code, and the legacy keyCode/which.

export const KEY_SPECS = {
  ArrowUp:    { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
  ArrowDown:  { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
  ArrowLeft:  { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Space:      { key: ' ',          code: 'Space',      keyCode: 32 },
  Enter:      { key: 'Enter',      code: 'Enter',      keyCode: 13 },
  Escape:     { key: 'Escape',     code: 'Escape',     keyCode: 27 },
  Tab:        { key: 'Tab',        code: 'Tab',        keyCode: 9  },
  Backspace:  { key: 'Backspace',  code: 'Backspace',  keyCode: 8  },
  Shift:      { key: 'Shift',      code: 'ShiftLeft',  keyCode: 16 },
  Control:    { key: 'Control',    code: 'ControlLeft',keyCode: 17 },
  Alt:        { key: 'Alt',        code: 'AltLeft',    keyCode: 18 },
};

// Letters A–Z
for (let i = 0; i < 26; i++) {
  const upper = String.fromCharCode(65 + i);
  const lower = String.fromCharCode(97 + i);
  KEY_SPECS[`Key${upper}`] = { key: lower, code: `Key${upper}`, keyCode: 65 + i };
}

// Digits 0–9
for (let i = 0; i < 10; i++) {
  KEY_SPECS[`Digit${i}`] = { key: String(i), code: `Digit${i}`, keyCode: 48 + i };
}

// Mouse button specs. button = 0 (left), 1 (middle), 2 (right) — same as the
// DOM MouseEvent.button values. Stored alongside keyboard specs in the
// gamepad bindings.
export const MOUSE_SPECS = {
  MouseLeft:   { type: 'mouse', button: 0 },
  MouseMiddle: { type: 'mouse', button: 1 },
  MouseRight:  { type: 'mouse', button: 2 },
};

// Mouse-aim direction specs. Multiple active directions combine vectorially:
// left+up = upper-left, opposing pairs (left+right) cancel. Lets the user
// emulate a right analog stick with four keys/buttons.
export const MOUSE_POINT_SPECS = {
  MousePointLeft:  { type: 'mouse_point', dir: 'left'  },
  MousePointRight: { type: 'mouse_point', dir: 'right' },
  MousePointUp:    { type: 'mouse_point', dir: 'up'    },
  MousePointDown:  { type: 'mouse_point', dir: 'down'  },
};

// App-level actions triggered on button press (edge-triggered, not held).
// These are intercepted before any keyboard/mouse dispatch and handled by
// main.js (pause toggles Ruffle; menu opens the settings panel).
export const ACTION_SPECS = {
  Pause: { type: 'action', action: 'pause' },
  Menu:  { type: 'action', action: 'menu'  },
};

// Build a normalized id used to dedupe presses across different bindings
// that produce the same physical key or mouse button. Prefer `code`
// (layout-independent), fall back to keyCode.
export function keyId(spec) {
  if (!spec) return null;
  if (spec.type === 'mouse') return `mouse:${spec.button}`;
  if (spec.type === 'mouse_point') return `mpoint:${spec.dir}`;
  if (spec.type === 'action') return `action:${spec.action}`;
  return spec.code || `kc:${spec.keyCode}` || spec.key;
}

// Resolve a stored binding (one of: a spec object, a string spec name from
// KEY_SPECS / MOUSE_SPECS / MOUSE_POINT_SPECS, or null) into a fully-
// populated spec, or null.
export function resolveSpec(binding) {
  if (!binding) return null;
  if (typeof binding === 'string') {
    return KEY_SPECS[binding] || MOUSE_SPECS[binding] || MOUSE_POINT_SPECS[binding] || ACTION_SPECS[binding] || null;
  }
  if (typeof binding === 'object') {
    if (binding.type === 'mouse' && typeof binding.button === 'number') return binding;
    if (binding.type === 'mouse_point' && typeof binding.dir === 'string') return binding;
    if (binding.type === 'action' && typeof binding.action === 'string') return binding;
    if (binding.keyCode != null) return binding;
  }
  return null;
}

// Pretty-print a spec for the UI.
export function formatSpec(spec) {
  if (!spec) return '—';
  if (spec.type === 'mouse') {
    return { 0: '🖱 Left', 1: '🖱 Middle', 2: '🖱 Right' }[spec.button] || '🖱';
  }
  if (spec.type === 'mouse_point') {
    return { left: 'Aim ←', right: 'Aim →', up: 'Aim ↑', down: 'Aim ↓' }[spec.dir] || 'Aim';
  }
  if (spec.type === 'action') {
    return { pause: 'Pause', menu: 'Menu' }[spec.action] || spec.action;
  }
  if (spec.code === 'Space') return 'Space';
  if (spec.code === 'Enter') return 'Enter';
  if (spec.code === 'Escape') return 'Esc';
  if (spec.code === 'Tab') return 'Tab';
  if (spec.code === 'Backspace') return '⌫';
  if (spec.code?.startsWith('Arrow')) {
    const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    return arrows[spec.code] || spec.code;
  }
  if (spec.code?.startsWith('Key')) return spec.code.slice(3);
  if (spec.code?.startsWith('Digit')) return spec.code.slice(5);
  return spec.code || spec.key || `kc:${spec.keyCode}`;
}

// Build a spec from a captured KeyboardEvent (for the "press a key" rebind UX).
export function specFromKeyboardEvent(ev) {
  return {
    key: ev.key,
    code: ev.code,
    keyCode: ev.keyCode || ev.which || 0,
  };
}

