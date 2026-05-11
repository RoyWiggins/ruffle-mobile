// Settings panel: per-binding key remapping, touch overlay options,
// and "edit layout" toggle for the touch overlay.

import { formatSpec, KEY_SPECS, specFromKeyboardEvent } from './keys.js';

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
  constructor({ panelEl, getProfile, saveProfile, onChange, onTouchEdit, onReset }) {
    this.panel = panelEl;
    this.getProfile = getProfile;
    this.saveProfile = saveProfile;
    this.onChange = onChange;
    this.onTouchEdit = onTouchEdit;
    this.onReset = onReset;
    this.capturing = null; // { binding, rowEl } | null

    this.touchMode = panelEl.querySelector('#touch-mode');
    this.touchOpacity = panelEl.querySelector('#touch-opacity');
    this.touchEditBtn = panelEl.querySelector('#touch-edit-btn');
    this.bindingsList = panelEl.querySelector('#bindings-list');
    this.resetBtn = panelEl.querySelector('#reset-profile-btn');
    this.closeBtn = panelEl.querySelector('#settings-close');

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

        const spec = p.profile.gamepad[binding];
        const specEl = document.createElement('span');
        specEl.className = 'keyspec';
        specEl.textContent = formatSpec(spec);

        const rebindBtn = document.createElement('button');
        rebindBtn.className = 'rebind-btn';
        rebindBtn.textContent = 'Rebind';
        rebindBtn.addEventListener('click', () => this._beginCapture(binding, row));

        const clearBtn = document.createElement('button');
        clearBtn.className = 'clear-btn';
        clearBtn.textContent = '✕';
        clearBtn.title = 'Unbind';
        clearBtn.addEventListener('click', () => this._setBinding(binding, null));

        row.append(labelEl, specEl, rebindBtn, clearBtn);
        this.bindingsList.appendChild(row);
      }
    }
  }

  _beginCapture(binding, rowEl) {
    this._cancelCapture();
    this.capturing = { binding, rowEl };
    rowEl.classList.add('capturing');
    rowEl.querySelector('.keyspec').textContent = 'Press a key…';
  }

  _cancelCapture() {
    if (!this.capturing) return;
    this.capturing.rowEl.classList.remove('capturing');
    this.capturing = null;
    this._renderBindings();
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
    const { binding } = this.capturing;
    this._setBinding(binding, spec);
  };

  _setBinding(binding, spec) {
    const p = this.getProfile();
    if (!p) return;
    p.profile.gamepad[binding] = spec;
    this.saveProfile();
    this._cancelCapture();
    this.onChange?.();
    this._renderBindings();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyCapture, true);
  }
}
