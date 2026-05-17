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
    this.onAction = null; // (action: string) => void — set by main.js
    this.mouse = new MouseController();
    // binding name -> input id currently held by that binding
    this.bindingToId = new Map();
    // input id -> { count, spec }
    this.refs = new Map();
    // Aim directions tracked by ref count so multiple bindings can hold
    // the same direction. Recomputed into a mouse position on every change.
    this.pointCounts = { left: 0, right: 0, up: 0, down: 0 };
    this.aimRadius = 1.2;
  }

  setHost(el) {
    if (this.host === el) return;
    this.releaseAll();
    this.host = el;
    this.mouse.setHost(el);
  }

  setAimRadius(r) {
    if (typeof r !== 'number' || !isFinite(r) || r <= 0) return;
    this.aimRadius = r;
    if (this._pointActive()) this._updateAim();
  }

  press(binding, spec) {
    if (!spec || !this.host) return;
    if (Array.isArray(spec)) {
      for (let i = 0; i < spec.length; i++) this._pressOne(`${binding}:${i}`, spec[i]);
      return;
    }
    this._pressOne(binding, spec);
  }

  release(binding) {
    if (this.bindingToId.has(binding)) {
      this._releaseOne(binding);
      return;
    }
    // Sub-bindings created by array specs.
    for (const b of Array.from(this.bindingToId.keys())) {
      if (b.startsWith(binding + ':')) this._releaseOne(b);
    }
  }

  _pressOne(binding, spec) {
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

  _releaseOne(binding) {
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
      this.pointCounts = { left: 0, right: 0, up: 0, down: 0 };
      this.mouse.relVX = 0;
      this.mouse.relVY = 0;
      this.mouse.releaseAll();
      return;
    }
    for (const [, ref] of this.refs) this._up(ref.spec);
    this.bindingToId.clear();
    this.refs.clear();
    this.pointCounts = { left: 0, right: 0, up: 0, down: 0 };
    this.mouse.relVX = 0;
    this.mouse.relVY = 0;
    this.mouse.releaseAll();
  }

  _down(spec) {
    if (spec.type === 'mouse') return this.mouse.press(spec.button);
    if (spec.type === 'mouse_point') {
      this.pointCounts[spec.dir]++;
      this._updateAim();
      return;
    }
    if (spec.type === 'action') {
      this.onAction?.(spec.action);
      return;
    }
    this._dispatchKey('keydown', spec);
  }

  _up(spec) {
    if (spec.type === 'mouse') return this.mouse.release(spec.button);
    if (spec.type === 'mouse_point') {
      this.pointCounts[spec.dir] = Math.max(0, this.pointCounts[spec.dir] - 1);
      this._updateAim();
      return;
    }
    if (spec.type === 'action') return; // actions fire on press only, not release
    this._dispatchKey('keyup', spec);
  }

  _pointActive() {
    return this.pointCounts.left || this.pointCounts.right ||
           this.pointCounts.up   || this.pointCounts.down;
  }

  _updateAim() {
    const c = this.pointCounts;
    const x = (c.right > 0 ? 1 : 0) - (c.left > 0 ? 1 : 0);
    const y = (c.down  > 0 ? 1 : 0) - (c.up   > 0 ? 1 : 0);
    if (x === 0 && y === 0) return; // don't move the cursor on cancel
    this.mouse.aimAt(x, y, this.aimRadius);
  }

  // Aim the virtual cursor at radius `r` (in fractions of the smaller stage
  // dimension) around the stage center, in direction (sx, sy). Magnitude of
  // (sx, sy) is ignored — only direction matters.
  aimMouseAt(sx, sy, r) {
    this.aimRadius = r;
    this.mouse.aimAt(sx, sy, r);
  }

  // Radial: magnitude maps to distance from center (0 = center, 1 = orbit radius).
  aimMouseRadial(sx, sy, r) {
    this.mouse.aimAtRadial(sx, sy, r);
  }

  // Map normalized stick values [-1,1] directly to the stage bounding rect.
  aimMouseAbsoluteNorm(nx, ny) {
    this.mouse.aimAbsoluteNorm(nx, ny);
  }

  // Velocity-based relative mouse update. Called every frame.
  updateRelativeMouse(ax, ay, cfg) {
    return this.mouse.updateRelative(ax, ay, cfg);
  }

  // Apply a raw pixel delta to the virtual cursor (used by pointer lock).
  applyMouseDelta(dx, dy, boundary = 'clamp') {
    this.mouse.applyDelta(dx, dy, boundary);
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
    this.relVX = 0; this.relVY = 0; // velocity for relative mode
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

  // Radial mode: stick magnitude maps to distance (0 = center, 1 = orbit radius).
  aimAtRadial(sx, sy, radius) {
    if (!this.host) return;
    const { cx, cy, half } = this._center();
    const d = half * radius;
    this.x = cx + sx * d;
    this.y = cy + sy * d;
    this._haveAimed = true;
    this._dispatch('pointermove');
    this._dispatch('mousemove');
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

  // Map normalized stick coords [-1,1] directly onto the stage bounding rect.
  aimAbsoluteNorm(nx, ny) {
    if (!this.host) return;
    const t = this._target() || this.host;
    if (!t) return;
    const r = t.getBoundingClientRect();
    this.x = r.left + (nx * 0.5 + 0.5) * r.width;
    this.y = r.top  + (ny * 0.5 + 0.5) * r.height;
    this._haveAimed = true;
    this._dispatch('pointermove');
    this._dispatch('mousemove');
  }

  // Velocity-based relative mouse movement. Called every animation frame.
  // Returns true if the cursor actually moved (for activity tracking).
  updateRelative(ax, ay, cfg) {
    if (!this.host) return false;
    const accel    = cfg?.accel    ?? 8;
    const maxSpeed = cfg?.maxSpeed ?? 20;
    const friction = cfg?.friction ?? 0.15;
    const boundary = cfg?.boundary ?? 'clamp'; // 'clamp' | 'wrap' | 'none'

    // Apply acceleration from stick input.
    this.relVX += ax * accel;
    this.relVY += ay * accel;

    // Clamp to max speed.
    const spd = Math.hypot(this.relVX, this.relVY);
    if (spd > maxSpeed) {
      this.relVX = this.relVX / spd * maxSpeed;
      this.relVY = this.relVY / spd * maxSpeed;
    }

    // Apply friction.
    this.relVX *= (1 - friction);
    this.relVY *= (1 - friction);

    const moved = Math.abs(this.relVX) > 0.01 || Math.abs(this.relVY) > 0.01;
    if (moved) {
      this.x += this.relVX;
      this.y += this.relVY;

      if (boundary !== 'none') {
        const t = this._target() || this.host;
        if (t) {
          const r = t.getBoundingClientRect();
          if (boundary === 'wrap') {
            // Wrap: exit one edge → re-enter opposite edge.
            if (this.x < r.left)   this.x = r.right;
            else if (this.x > r.right)  this.x = r.left;
            if (this.y < r.top)    this.y = r.bottom;
            else if (this.y > r.bottom) this.y = r.top;
          } else {
            // Clamp: stop at stage edges, kill velocity on impact.
            if (this.x < r.left)   { this.x = r.left;   this.relVX = 0; }
            else if (this.x > r.right)  { this.x = r.right;  this.relVX = 0; }
            if (this.y < r.top)    { this.y = r.top;    this.relVY = 0; }
            else if (this.y > r.bottom) { this.y = r.bottom; this.relVY = 0; }
          }
        }
      }

      this._haveAimed = true;
      this._dispatch('pointermove');
      this._dispatch('mousemove');
    }
    return moved;
  }

  // Apply a raw pixel delta (for pointer lock). Initialises at stage center
  // on first call if cursor hasn't been positioned yet.
  applyDelta(dx, dy, boundary = 'clamp') {
    if (!this.host) return;
    if (!this._haveAimed) {
      const { cx, cy } = this._center();
      this.x = cx; this.y = cy;
    }
    this.x += dx;
    this.y += dy;
    if (boundary !== 'none') {
      const t = this._target() || this.host;
      if (t) {
        const r = t.getBoundingClientRect();
        if (boundary === 'wrap') {
          if (this.x < r.left)        this.x = r.right;
          else if (this.x > r.right)  this.x = r.left;
          if (this.y < r.top)         this.y = r.bottom;
          else if (this.y > r.bottom) this.y = r.top;
        } else {
          this.x = Math.max(r.left, Math.min(r.right,  this.x));
          this.y = Math.max(r.top,  Math.min(r.bottom, this.y));
        }
      }
    }
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
