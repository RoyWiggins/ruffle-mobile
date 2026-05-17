// On-screen touch overlay: virtual d-pad + labeled action buttons.
// Uses Pointer Events with setPointerCapture so a finger sliding off a
// button still releases cleanly. Buttons are positioned with normalized
// (0–1) coordinates so the layout scales with the wrapper.

export class TouchOverlay {
  constructor(rootEl, input, getProfile, saveProfile, onActivity, getOrientation) {
    this.root = rootEl;
    this.input = input;
    this.getProfile = getProfile;
    this.saveProfile = saveProfile;
    this.onActivity = onActivity;
    this.getOrientation = getOrientation || (() => 'portrait');
    // pointerId -> { binding | null, dpadEl | null, currentDirs: Set }
    this.pointers = new Map();
    this.editing = false;
    this._items = new Map(); // id -> DOM node
    this._dpadDirState = new Map(); // dpadId -> { up,down,left,right }

    this.root.addEventListener('contextmenu', e => e.preventDefault());
    this._attachTrackpadHandlers();
  }

  // Trackpad-style mouse input for the overlay background (non-button areas).
  // Touch-and-drag moves the cursor; a tap (quick + little movement) fires a click.
  // This prevents every touch from immediately being a mousedown, which breaks
  // aim-then-click games on touch screens.
  _attachTrackpadHandlers() {
    const TAP_PX = 12;
    const TAP_MS = 300; // must be quick AND small to count as a tap
    const active = new Map(); // pointerId → { startX, startY, startT, moved }

    this.root.addEventListener('pointerdown', (ev) => {
      if (ev.target !== this.root) return; // buttons/dpad capture their own touches
      if (this.editing) return;
      ev.preventDefault();
      try { this.root.setPointerCapture(ev.pointerId); } catch (_) {}
      active.set(ev.pointerId, { startX: ev.clientX, startY: ev.clientY, startT: Date.now(), moved: false });
      this.input.aimMouseClient(ev.clientX, ev.clientY);
      this.onActivity?.('touch');
    }, { passive: false });

    this.root.addEventListener('pointermove', (ev) => {
      const t = active.get(ev.pointerId);
      if (!t) return;
      if (Math.hypot(ev.clientX - t.startX, ev.clientY - t.startY) > TAP_PX) t.moved = true;
      this.input.aimMouseClient(ev.clientX, ev.clientY);
    });

    const onUp = (ev) => {
      const t = active.get(ev.pointerId);
      if (!t) return;
      active.delete(ev.pointerId);
      try { this.root.releasePointerCapture(ev.pointerId); } catch (_) {}
      if (!t.moved && (Date.now() - t.startT) < TAP_MS) {
        this.input.mouse.press(0);
        this.input.mouse.release(0);
      }
    };
    this.root.addEventListener('pointerup', onUp);
    this.root.addEventListener('pointercancel', (ev) => active.delete(ev.pointerId));
  }

  setVisible(visible) {
    if (!visible) {
      this.releaseAll();
      this.root.hidden = true;
    } else {
      this.root.hidden = false;
      this.render();
    }
  }

  setOpacity(opacity) {
    this.root.style.opacity = String(opacity);
  }

  releaseAll() {
    for (const [, p] of this.pointers) {
      if (p.binding) this.input.release(p.binding);
      if (p.dpadDirs) {
        for (const dir of p.dpadDirs) this.input.release('dpad_' + dir);
      }
    }
    this.pointers.clear();
    this._dpadDirState.clear();
    this._clearVisualState();
  }

  setEditing(editing) {
    this.editing = editing;
    this.root.classList.toggle('editing', editing);
    this.releaseAll();
    this.render();
  }

  render() {
    const profile = this.getProfile();
    if (!profile) return;
    const layouts = profile.profile.touch.layouts || {};
    const layout = layouts[this.getOrientation()] || [];
    this.root.innerHTML = '';
    this._items.clear();

    for (const item of layout) {
      const el = item.type === 'dpad' ? this._makeDpad(item) : this._makeButton(item);
      this._items.set(item.id, el);
      this.root.appendChild(el);
    }
    this.setOpacity(profile.profile.touch.opacity ?? 0.6);
  }

  _makeButton(item) {
    const el = document.createElement('div');
    el.className = 'touch-item touch-button';
    el.dataset.id = item.id;
    el.dataset.kind = 'button';
    const lbl = document.createElement('span');
    lbl.className = 'label';
    lbl.textContent = item.label || '';
    el.appendChild(lbl);
    this._positionItem(el, item);
    if (this.editing) {
      this._attachEditHandlers(el, item);
    } else {
      this._attachButtonHandlers(el, item);
    }
    return el;
  }

  _makeDpad(item) {
    const el = document.createElement('div');
    el.className = 'touch-item touch-dpad';
    el.dataset.id = item.id;
    el.dataset.kind = 'dpad';
    this._positionItem(el, item);
    for (const dir of ['up','down','left','right']) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow ' + dir;
      arrow.textContent = { up:'▲', down:'▼', left:'◀', right:'▶' }[dir];
      el.appendChild(arrow);
    }
    if (this.editing) {
      this._attachEditHandlers(el, item);
    } else {
      this._attachDpadHandlers(el, item);
    }
    return el;
  }

  _positionItem(el, item) {
    el.style.left = (item.x * 100) + '%';
    el.style.top  = item.topExpr ?? (item.y * 100) + '%';
    // Size is a fraction of the screen's smaller dimension (CSS var set in
    // main.js), so fullscreen doesn't grow the d-pad and buttons. Falls back
    // to wrapper cqmin if the variable isn't set.
    el.style.width = `calc(${item.size} * var(--touch-base, 100cqmin))`;
    el.style.aspectRatio = '1';
  }

  _attachButtonHandlers(el, item) {
    const onDown = (ev) => {
      if (this.editing) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      const binding = item.binding;
      const profile = this.getProfile();
      const spec = profile?.profile.gamepad[binding];
      if (spec) this.input.press(binding, spec);
      el.classList.add('pressed');
      vibrate();
      this.pointers.set(ev.pointerId, { binding, el });
      this.onActivity?.('touch');
    };
    const onUp = (ev) => {
      const p = this.pointers.get(ev.pointerId);
      if (!p) return;
      if (p.binding) this.input.release(p.binding);
      el.classList.remove('pressed');
      this.pointers.delete(ev.pointerId);
      try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
  }

  _attachDpadHandlers(el, item) {
    // Analog-style: direction is computed from the offset of the finger
    // from the d-pad center. Diagonals fire two adjacent keys.
    const onMove = (ev) => {
      const p = this.pointers.get(ev.pointerId);
      if (!p || p.dpadEl !== el) return;
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = ev.clientX - cx;
      const dy = ev.clientY - cy;
      const dirs = computeDpadDirs(dx, dy, rect.width / 2);
      this._applyDpadDirs(el, p, dirs);
    };
    const onDown = (ev) => {
      if (this.editing) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      this.pointers.set(ev.pointerId, { dpadEl: el, dpadDirs: new Set() });
      vibrate();
      onMove(ev);
      this.onActivity?.('touch');
    };
    const onUp = (ev) => {
      const p = this.pointers.get(ev.pointerId);
      if (!p) return;
      this._applyDpadDirs(el, p, new Set());
      this.pointers.delete(ev.pointerId);
      try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
  }

  _applyDpadDirs(el, pointerState, newDirs) {
    const old = pointerState.dpadDirs;
    const profile = this.getProfile();
    for (const dir of ['up','down','left','right']) {
      const binding = 'dpad_' + dir;
      const wasOn = old.has(dir);
      const isOn = newDirs.has(dir);
      if (isOn && !wasOn) {
        const spec = profile?.profile.gamepad[binding];
        if (spec) this.input.press(binding, spec);
      } else if (!isOn && wasOn) {
        this.input.release(binding);
      }
      el.classList.toggle('dir-' + dir, isOn);
    }
    pointerState.dpadDirs = newDirs;
  }

  _attachEditHandlers(el, item) {
    let dragStart = null;
    const onDown = (ev) => {
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      const rect = this.root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      dragStart = {
        px: ev.clientX, py: ev.clientY,
        // Measure actual visual center so topExpr items drag from the right spot.
        ix: (elRect.left + elRect.width  / 2 - rect.left) / rect.width,
        iy: (elRect.top  + elRect.height / 2 - rect.top)  / rect.height,
        rect,
      };
    };
    const onMove = (ev) => {
      if (!dragStart) return;
      const dx = (ev.clientX - dragStart.px) / dragStart.rect.width;
      const dy = (ev.clientY - dragStart.py) / dragStart.rect.height;
      item.x = clamp(dragStart.ix + dx, 0.02, 0.98);
      item.y = clamp(dragStart.iy + dy, 0.02, 0.98);
      delete item.topExpr; // user drag overrides the computed expression
      this._positionItem(el, item);
    };
    const onUp = (ev) => {
      if (!dragStart) return;
      dragStart = null;
      try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
      this.saveProfile();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  _clearVisualState() {
    for (const el of this._items.values()) {
      el.classList.remove('pressed', 'dir-up', 'dir-down', 'dir-left', 'dir-right');
    }
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function vibrate() {
  if (navigator.vibrate) {
    try { navigator.vibrate(10); } catch (_) {}
  }
}

// Compute active directions from a finger offset relative to d-pad center.
// Returns a Set of 'up'/'down'/'left'/'right'. Diagonals include both.
function computeDpadDirs(dx, dy, radius) {
  const dirs = new Set();
  const r = radius || 1;
  const nx = dx / r;
  const ny = dy / r;
  if (Math.hypot(nx, ny) < 0.25) return dirs; // center dead zone
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  // An axis triggers when its component is at least 40% of the other —
  // gives wide cardinal zones with diagonals near the corners.
  const ratio = 0.40;
  if (ax >= ratio * ay) dirs.add(nx < 0 ? 'left' : 'right');
  if (ay >= ratio * ax) dirs.add(ny < 0 ? 'up' : 'down');
  return dirs;
}
