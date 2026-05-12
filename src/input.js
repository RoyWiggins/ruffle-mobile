// Synthetic input dispatch into the Ruffle host element. Supports keyboard
// specs and mouse-button specs. Press counts are ref-counted so several
// bindings (e.g. dpad_up and left_stick_up) can press the same input
// without stomping each other.
//
// For mouse, MouseController also tracks a virtual cursor position and
// dispatches mousemove/pointermove events so the right-stick can aim.

import { keyId } from './keys.js';

export class InputDispatcher {
  constructor() {
    this.host = null;
    this.mouse = new MouseController();
    // binding name -> input id currently held by that binding
    this.bindingToId = new Map();
    // input id -> { count, spec }
    this.refs = new Map();
  }

  setHost(el) {
    if (this.host === el) return;
    this.releaseAll();
    this.host = el;
    this.mouse.setHost(el);
  }

  press(binding, spec) {
    if (!spec || !this.host) return;
    const id = keyId(spec);
    const existing = this.bindingToId.get(binding);
    if (existing === id) return;
    if (existing) this._releaseId(existing);
    this.bindingToId.set(binding, id);
    const ref = this.refs.get(id) || { count: 0, spec };
    ref.count++;
    ref.spec = spec;
    this.refs.set(id, ref);
    if (ref.count === 1) this._down(spec);
  }

  release(binding) {
    const id = this.bindingToId.get(binding);
    if (!id) return;
    this.bindingToId.delete(binding);
    this._releaseId(id);
  }

  _releaseId(id) {
    const ref = this.refs.get(id);
    if (!ref) return;
    ref.count--;
    if (ref.count <= 0) {
      this.refs.delete(id);
      this._up(ref.spec);
    }
  }

  releaseAll() {
    if (!this.host) {
      this.bindingToId.clear();
      this.refs.clear();
      this.mouse.releaseAll();
      return;
    }
    for (const [, ref] of this.refs) this._up(ref.spec);
    this.bindingToId.clear();
    this.refs.clear();
    this.mouse.releaseAll();
  }

  _down(spec) {
    if (spec.type === 'mouse') this.mouse.press(spec.button);
    else this._dispatchKey('keydown', spec);
  }

  _up(spec) {
    if (spec.type === 'mouse') this.mouse.release(spec.button);
    else this._dispatchKey('keyup', spec);
  }

  // Aim the virtual cursor at radius `r` (in fractions of the smaller stage
  // dimension) around the stage center, in direction (sx, sy). Magnitude of
  // (sx, sy) is ignored — only direction matters.
  aimMouseAt(sx, sy, r) {
    this.mouse.aimAt(sx, sy, r);
  }

  _dispatchKey(type, spec) {
    if (!this.host) return;
    try { this.host.focus({ preventScroll: true }); } catch (_) {}
    const ev = new KeyboardEvent(type, {
      key: spec.key,
      code: spec.code,
      keyCode: spec.keyCode,
      which: spec.keyCode,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    if (ev.keyCode !== spec.keyCode) {
      try {
        Object.defineProperty(ev, 'keyCode', { get: () => spec.keyCode });
        Object.defineProperty(ev, 'which',   { get: () => spec.keyCode });
      } catch (_) {}
    }
    this.host.dispatchEvent(ev);
  }
}

// MouseController: a virtual mouse cursor. Tracks position in viewport
// coordinates (clientX / clientY) and dispatches synthetic mousemove,
// mousedown, mouseup, and pointer* events on the Ruffle canvas. The position
// can sit *outside* the canvas bounds — Flash content keying off
// stage._xmouse / mouseMove can read negative or > stage_width values, which
// is what shooter aim-direction code expects.
export class MouseController {
  constructor() {
    this.host = null;
    this.x = 0; this.y = 0;
    this.pressed = new Set(); // currently-held button numbers
    this._haveAimed = false;
  }

  setHost(el) {
    this.releaseAll();
    this.host = el;
    this._haveAimed = false;
  }

  // Dispatch on Ruffle's internal canvas (inside open shadow root) when
  // available; fall back to the host element.
  _target() {
    if (!this.host) return null;
    const sr = this.host.shadowRoot;
    if (sr) {
      const c = sr.querySelector('canvas');
      if (c) return c;
    }
    return this.host;
  }

  _center() {
    const t = this._target() || this.host;
    if (!t) return { cx: 0, cy: 0, half: 0 };
    const r = t.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      half: Math.min(r.width, r.height) / 2,
    };
  }

  aimAt(sx, sy, radius) {
    if (!this.host) return;
    const mag = Math.hypot(sx, sy) || 1;
    const nx = sx / mag, ny = sy / mag;
    const { cx, cy, half } = this._center();
    const d = half * radius;
    this.x = cx + nx * d;
    this.y = cy + ny * d;
    this._haveAimed = true;
    this._dispatch('pointermove');
    this._dispatch('mousemove');
  }

  press(button) {
    if (!this.host || this.pressed.has(button)) return;
    // If we've never aimed, default to the stage center so a click goes
    // somewhere reasonable rather than at (0,0).
    if (!this._haveAimed) {
      const { cx, cy } = this._center();
      this.x = cx; this.y = cy;
      this._haveAimed = true;
    }
    this.pressed.add(button);
    this._dispatch('pointerdown', button);
    this._dispatch('mousedown', button);
  }

  release(button) {
    if (!this.host || !this.pressed.has(button)) return;
    this.pressed.delete(button);
    this._dispatch('pointerup', button);
    this._dispatch('mouseup', button);
    this._dispatch('click', button);
  }

  releaseAll() {
    for (const b of Array.from(this.pressed)) this.release(b);
  }

  _dispatch(type, button = 0) {
    const target = this._target();
    if (!target) return;
    const init = {
      bubbles: true, composed: true, cancelable: true,
      clientX: this.x, clientY: this.y,
      screenX: this.x, screenY: this.y,
      button,
      buttons: this._buttonsMask(),
      view: window,
    };
    let ev;
    if (type.startsWith('pointer')) {
      try {
        ev = new PointerEvent(type, { ...init, pointerType: 'mouse', pointerId: 1, isPrimary: true });
      } catch (_) {
        ev = new MouseEvent(type, init);
      }
    } else {
      ev = new MouseEvent(type, init);
    }
    target.dispatchEvent(ev);
  }

  _buttonsMask() {
    let m = 0;
    for (const b of this.pressed) {
      // Web MouseEvent.buttons mask: left=1, right=2, middle=4
      m |= (b === 0 ? 1 : b === 1 ? 4 : b === 2 ? 2 : 0);
    }
    return m;
  }
}
