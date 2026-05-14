// Settings panel: per-binding key remapping, touch overlay options,
// and "edit layout" toggle for the touch overlay.

import { formatSpec, KEY_SPECS, MOUSE_SPECS, MOUSE_POINT_SPECS, ACTION_SPECS, specFromKeyboardEvent } from './keys.js';

// Bindings in storage are either null, a single spec, or an array of specs.
function bindingSpecArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v.slice() : [v];
}
function packBindingArray(arr) {
  if (!arr || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  return arr;
}

const BINDING_GROUPS = [
  {
    title: 'D-pad',
    rows: [
      ['dpad_up', 'Up'], ['dpad_down', 'Down'],
      ['dpad_left', 'Left'], ['dpad_right', 'Right'],
    ],
  },
  {
    title: 'Face buttons',
    rows: [
      ['button_a', 'A (bottom)'], ['button_b', 'B (right)'],
      ['button_x', 'X (left)'],   ['button_y', 'Y (top)'],
    ],
  },
  {
    title: 'Shoulders',
    rows: [
      ['button_lb', 'LB'], ['button_rb', 'RB'],
      ['button_lt', 'LT'], ['button_rt', 'RT'],
    ],
  },
  {
    title: 'Menu',
    rows: [['start', 'Start'], ['select', 'Select']],
  },
  {
    title: 'Left stick (analog)',
    rows: [
      ['left_stick_up', 'Up'], ['left_stick_down', 'Down'],
      ['left_stick_left', 'Left'], ['left_stick_right', 'Right'],
    ],
  },
];

export class SettingsUI {
  constructor({ panelEl, getProfile, saveProfile, onChange, onTouchEdit, onReset, getOrientation, getReservedBottom, setReservedBottom }) {
    this.panel = panelEl;
    this.getProfile = getProfile;
    this.saveProfile = saveProfile;
    this.onChange = onChange;
    this.onTouchEdit = onTouchEdit;
    this.onReset = onReset;
    this.getOrientation = getOrientation || (() => 'portrait');
    this.getReservedBottom = getReservedBottom || (() => 0);
    this.setReservedBottom = setReservedBottom || (() => {});
    this.capturing = null; // { binding, rowEl } | null

    this.displayAlign = panelEl.querySelector('#display-align');
    this.fitMode = panelEl.querySelector('#fit-mode');
    this.customAspectRow = panelEl.querySelector('#custom-aspect-row');
    this.customAspectW = panelEl.querySelector('#custom-aspect-w');
    this.customAspectH = panelEl.querySelector('#custom-aspect-h');
    this.reservedBottom = panelEl.querySelector('#reserved-bottom');
    this.reservedBottomValue = panelEl.querySelector('#reserved-bottom-value');
    this.zoom = panelEl.querySelector('#zoom');
    this.zoomValue = panelEl.querySelector('#zoom-value');
    this.rightStickMode = panelEl.querySelector('#right-stick-mode');
    this.rightStickRadius = panelEl.querySelector('#right-stick-radius');
    this.rightStickRadiusValue = panelEl.querySelector('#right-stick-radius-value');
    this.touchMode = panelEl.querySelector('#touch-mode');
    this.touchOpacity = panelEl.querySelector('#touch-opacity');
    this.touchEditBtn = panelEl.querySelector('#touch-edit-btn');
    this.bindingsList = panelEl.querySelector('#bindings-list');
    this.resetBtn = panelEl.querySelector('#reset-profile-btn');
    this.closeBtn = panelEl.querySelector('#settings-close');

    this.displayAlign.addEventListener('change', () => {
      const p = this.getProfile();
      if (!p) return;
      p.profile.display = p.profile.display || {};
      p.profile.display.align = this.displayAlign.value;
      this.saveProfile();
      this.onChange?.();
    });

    this.fitMode.addEventListener('change', () => {
      const p = this.getProfile();
      if (!p) return;
      p.profile.display = p.profile.display || {};
      p.profile.display.fitMode = this.fitMode.value;
      this.customAspectRow.hidden = this.fitMode.value !== 'custom';
      this.saveProfile();
      this.onChange?.();
    });

    const onCustomAspectInput = () => {
      const p = this.getProfile();
      if (!p) return;
      p.profile.display = p.profile.display || {};
      const c = p.profile.display.customAspect = p.profile.display.customAspect || { width: 640, height: 480 };
      const w = Number(this.customAspectW.value);
      const h = Number(this.customAspectH.value);
      if (w > 0) c.width = w;
      if (h > 0) c.height = h;
      this.saveProfile();
      this.onChange?.();
    };
    this.customAspectW.addEventListener('input', onCustomAspectInput);
    this.customAspectH.addEventListener('input', onCustomAspectInput);

    this.reservedBottom.addEventListener('input', () => {
      const v = Number(this.reservedBottom.value);
      this.reservedBottomValue.textContent = Math.round(v * 100) + '%';
      this.setReservedBottom(this.getOrientation(), v);
    });

    this.zoom.addEventListener('input', () => {
      const p = this.getProfile();
      if (!p) return;
      const v = Number(this.zoom.value);
      p.profile.display = p.profile.display || {};
      p.profile.display.zoom = v;
      this.zoomValue.textContent = v.toFixed(2) + '×';
      this.saveProfile();
      this.onChange?.();
    });

    this.rightStickMode.addEventListener('change', () => {
      const p = this.getProfile();
      if (!p) return;
      const axes = p.profile.axes = p.profile.axes || {};
      const rs = axes.right_stick = axes.right_stick || { deadzone: 0.18, radius: 1.2 };
      rs.mode = this.rightStickMode.value;
      this.saveProfile();
      this.onChange?.();
    });
    this.rightStickRadius.addEventListener('input', () => {
      const p = this.getProfile();
      if (!p) return;
      const axes = p.profile.axes = p.profile.axes || {};
      const rs = axes.right_stick = axes.right_stick || { mode: 'off', deadzone: 0.18 };
      rs.radius = Number(this.rightStickRadius.value);
      this.rightStickRadiusValue.textContent = rs.radius.toFixed(2) + '×';
      this.saveProfile();
    });

    this.touchMode.addEventListener('change', () => {
      const p = this.getProfile();
      if (!p) return;
      p.profile.touch.enabled = this.touchMode.value;
      this.saveProfile();
      this.onChange?.();
    });
    this.touchOpacity.addEventListener('input', () => {
      const p = this.getProfile();
      if (!p) return;
      p.profile.touch.opacity = Number(this.touchOpacity.value);
      this.saveProfile();
      this.onChange?.();
    });
    this.touchEditBtn.addEventListener('click', () => this.onTouchEdit?.());
    this.resetBtn.addEventListener('click', () => {
      if (confirm('Reset bindings and touch layout to defaults?')) {
        this.onReset?.();
      }
    });

    // Capture next keydown for binding when in capture mode.
    window.addEventListener('keydown', this._onKeyCapture, true);
  }

  open() {
    this.panel.hidden = false;
    this.refresh();
  }

  close() {
    this.panel.hidden = true;
    this._cancelCapture();
  }

  refresh() {
    const p = this.getProfile();
    if (!p) return;
    this.displayAlign.value = p.profile.display?.align || 'auto';
    this.fitMode.value = p.profile.display?.fitMode || 'aspect';
    this.customAspectRow.hidden = this.fitMode.value !== 'custom';
    const ca = p.profile.display?.customAspect || { width: 640, height: 480 };
    this.customAspectW.value = String(ca.width);
    this.customAspectH.value = String(ca.height);
    const reserved = this.getReservedBottom(this.getOrientation());
    this.reservedBottom.value = String(reserved);
    this.reservedBottomValue.textContent = Math.round(reserved * 100) + '%';
    const zoom = p.profile.display?.zoom ?? 1.0;
    this.zoom.value = String(zoom);
    this.zoomValue.textContent = Number(zoom).toFixed(2) + '×';
    const rs = p.profile.axes?.right_stick || {};
    this.rightStickMode.value = rs.mode || 'off';
    const r = rs.radius ?? 1.2;
    this.rightStickRadius.value = String(r);
    this.rightStickRadiusValue.textContent = Number(r).toFixed(2) + '×';
    this.touchMode.value = p.profile.touch.enabled || 'auto';
    this.touchOpacity.value = String(p.profile.touch.opacity ?? 0.6);
    this._renderBindings();
  }

  _renderBindings() {
    const p = this.getProfile();
    if (!p) return;
    this.bindingsList.innerHTML = '';
    for (const group of BINDING_GROUPS) {
      const h = document.createElement('h4');
      h.textContent = group.title;
      h.style.margin = '0.8em 0 0.2em';
      h.style.color = 'var(--muted)';
      h.style.fontSize = '0.85em';
      this.bindingsList.appendChild(h);

      for (const [binding, label] of group.rows) {
        const row = document.createElement('div');
        row.className = 'binding-row';
        row.dataset.binding = binding;

        const labelEl = document.createElement('span');
        labelEl.className = 'label';
        labelEl.textContent = label;
        row.appendChild(labelEl);

        const slotsEl = document.createElement('span');
        slotsEl.className = 'binding-slots';
        const specs = bindingSpecArray(p.profile.gamepad[binding]);
        if (specs.length === 0) {
          const empty = document.createElement('span');
          empty.className = 'keyspec keyspec-empty';
          empty.textContent = '—';
          slotsEl.appendChild(empty);
        }
        for (let i = 0; i < specs.length; i++) {
          slotsEl.appendChild(this._buildSpecChip(binding, i, specs[i]));
        }
        row.appendChild(slotsEl);

        const addBtn = document.createElement('button');
        addBtn.className = 'rebind-btn';
        addBtn.title = specs.length === 0 ? 'Bind' : 'Add another binding';
        addBtn.textContent = specs.length === 0 ? 'Bind' : '+';
        addBtn.addEventListener('click', () => this._beginCapture(binding, specs.length, row));
        row.appendChild(addBtn);

        this.bindingsList.appendChild(row);
      }
    }
  }

  _buildSpecChip(binding, slotIndex, spec) {
    const chip = document.createElement('span');
    chip.className = 'binding-chip';
    const specEl = document.createElement('span');
    specEl.className = 'keyspec';
    specEl.dataset.slot = String(slotIndex);
    specEl.textContent = formatSpec(spec);
    specEl.title = 'Tap to rebind';
    specEl.addEventListener('click', () => this._beginCapture(binding, slotIndex, chip.closest('.binding-row')));
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-btn';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Remove this binding';
    clearBtn.addEventListener('click', () => this._setBinding(binding, slotIndex, null));
    chip.append(specEl, clearBtn);
    return chip;
  }

  _beginCapture(binding, slotIndex, rowEl) {
    this._cancelCapture();
    const label = rowEl.querySelector('.label')?.textContent || binding;
    this.capturing = { binding, slotIndex, rowEl, label };
    rowEl.classList.add('capturing');
    this._openKeyPicker(binding, slotIndex, label);
  }

  _cancelCapture() {
    if (!this.capturing) return;
    this.capturing.rowEl.classList.remove('capturing');
    this.capturing = null;
    this._closeKeyPicker();
    this._renderBindings();
  }

  _openKeyPicker(binding, slotIndex, label) {
    this._closeKeyPicker();

    const overlay = document.createElement('div');
    overlay.className = 'key-picker-overlay';
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) this._cancelCapture();
    });

    const picker = document.createElement('div');
    picker.className = 'key-picker';

    const header = document.createElement('header');
    const title = document.createElement('span');
    title.innerHTML = 'Bind <strong></strong> to:';
    title.querySelector('strong').textContent = label;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'picker-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this._cancelCapture());
    header.append(title, closeBtn);
    picker.appendChild(header);

    const sections = [
      { label: 'Actions',  specs: [ACTION_SPECS.Pause, ACTION_SPECS.Menu] },
      { label: 'Mouse',    specs: [MOUSE_SPECS.MouseLeft, MOUSE_SPECS.MouseRight, MOUSE_SPECS.MouseMiddle] },
      { label: 'Aim',      specs: [MOUSE_POINT_SPECS.MousePointLeft, MOUSE_POINT_SPECS.MousePointRight, MOUSE_POINT_SPECS.MousePointUp, MOUSE_POINT_SPECS.MousePointDown] },
      { label: 'Arrows',   keys: ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'] },
      { label: 'Special',  keys: ['Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Shift', 'Control', 'Alt'] },
      { label: 'Letters',  keys: Array.from({ length: 26 }, (_, i) => 'Key' + String.fromCharCode(65 + i)) },
      { label: 'Digits',   keys: Array.from({ length: 10 }, (_, i) => 'Digit' + i) },
    ];

    for (const section of sections) {
      const sec = document.createElement('section');
      sec.className = 'picker-section';
      const h = document.createElement('h5');
      h.textContent = section.label;
      sec.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'picker-grid';
      const specs = section.specs || section.keys.map((k) => KEY_SPECS[k]).filter(Boolean);
      for (const spec of specs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = formatSpec(spec);
        btn.addEventListener('click', () => this._setBinding(binding, slotIndex, spec));
        grid.appendChild(btn);
      }
      sec.appendChild(grid);
      picker.appendChild(sec);
    }

    const unbindBtn = document.createElement('button');
    unbindBtn.type = 'button';
    unbindBtn.className = 'picker-unbind';
    unbindBtn.textContent = 'Remove this binding';
    unbindBtn.addEventListener('click', () => this._setBinding(binding, slotIndex, null));
    picker.appendChild(unbindBtn);

    const hint = document.createElement('p');
    hint.className = 'picker-hint';
    hint.textContent = '…or press a key on a keyboard';
    picker.appendChild(hint);

    overlay.appendChild(picker);
    document.body.appendChild(overlay);
    this._pickerOverlay = overlay;
  }

  _closeKeyPicker() {
    if (this._pickerOverlay) {
      this._pickerOverlay.remove();
      this._pickerOverlay = null;
    }
  }

  _onKeyCapture = (ev) => {
    if (!this.capturing) return;
    // Allow Escape to cancel.
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      this._cancelCapture();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const spec = specFromKeyboardEvent(ev);
    const { binding, slotIndex } = this.capturing;
    this._setBinding(binding, slotIndex, spec);
  };

  _setBinding(binding, slotIndex, spec) {
    const p = this.getProfile();
    if (!p) return;
    const arr = bindingSpecArray(p.profile.gamepad[binding]);
    if (spec == null) {
      if (slotIndex >= 0 && slotIndex < arr.length) arr.splice(slotIndex, 1);
    } else if (slotIndex >= arr.length) {
      arr.push(spec);
    } else {
      arr[slotIndex] = spec;
    }
    p.profile.gamepad[binding] = packBindingArray(arr);
    this.saveProfile();
    this._cancelCapture();
    this.onChange?.();
    this._renderBindings();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyCapture, true);
  }
}
