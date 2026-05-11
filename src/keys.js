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

// Build a normalized key id used to dedupe presses across different bindings
// that produce the same physical key. Prefer `code` (layout-independent),
// fall back to keyCode.
export function keyId(spec) {
  if (!spec) return null;
  return spec.code || `kc:${spec.keyCode}` || spec.key;
}

// Resolve a stored binding (one of: a key-spec object, a string spec name,
// or null) into a fully-populated key spec, or null if unbound.
export function resolveSpec(binding) {
  if (!binding) return null;
  if (typeof binding === 'string') return KEY_SPECS[binding] || null;
  if (typeof binding === 'object' && binding.keyCode != null) return binding;
  return null;
}

// Pretty-print a key spec for the UI.
export function formatSpec(spec) {
  if (!spec) return '—';
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
