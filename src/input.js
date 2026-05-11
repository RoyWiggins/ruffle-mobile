// Synthetic KeyboardEvent dispatch into the Ruffle host element, with
// ref-counted press tracking so that several bindings (e.g. dpad_up and
// left_stick_up) can press the same key without stomping each other.

import { keyId } from './keys.js';

export class InputDispatcher {
  constructor() {
    this.host = null;
    // binding name -> key id currently held by that binding
    this.bindingToId = new Map();
    // key id -> { count, spec }
    this.refs = new Map();
  }

  setHost(el) {
    if (this.host === el) return;
    this.releaseAll();
    this.host = el;
  }

  // Press a key on behalf of a named binding. If the binding is already
  // holding a (possibly different) key, that earlier hold is released first.
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
    if (ref.count === 1) this._dispatch('keydown', spec);
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
      this._dispatch('keyup', ref.spec);
    }
  }

  releaseAll() {
    if (!this.host) {
      this.bindingToId.clear();
      this.refs.clear();
      return;
    }
    for (const [, ref] of this.refs) {
      this._dispatch('keyup', ref.spec);
    }
    this.bindingToId.clear();
    this.refs.clear();
  }

  _dispatch(type, spec) {
    if (!this.host) return;
    // Ruffle's input path requires the host element to be focused. If the
    // user clicks elsewhere we re-focus on each dispatch — cheap and safe.
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
    // Some browsers ignore the keyCode/which constructor options on
    // KeyboardEvent. Force them via defineProperty as a fallback.
    if (ev.keyCode !== spec.keyCode) {
      try {
        Object.defineProperty(ev, 'keyCode', { get: () => spec.keyCode });
        Object.defineProperty(ev, 'which',   { get: () => spec.keyCode });
      } catch (_) {}
    }
    this.host.dispatchEvent(ev);
  }
}
