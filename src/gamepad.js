// Gamepad polling loop. Reads the standard gamepad mapping every frame,
// edge-detects button transitions, and converts the left stick to a
// digital d-pad with hysteresis.

// Standard gamepad button indices → logical bindings.
const BUTTON_BINDINGS = {
  0: 'button_a',
  1: 'button_b',
  2: 'button_x',
  3: 'button_y',
  4: 'button_lb',
  5: 'button_rb',
  6: 'button_lt',
  7: 'button_rt',
  8: 'select',
  9: 'start',
  12: 'dpad_up',
  13: 'dpad_down',
  14: 'dpad_left',
  15: 'dpad_right',
};

const STICK_BINDINGS = {
  left_up: 'left_stick_up',
  left_down: 'left_stick_down',
  left_left: 'left_stick_left',
  left_right: 'left_stick_right',
};

export class GamepadHandler {
  constructor(input, getProfile, onActivity) {
    this.input = input;
    this.getProfile = getProfile;
    this.onActivity = onActivity;
    // gamepad index -> { buttons: bool[], stick: {up,down,left,right} }
    this.state = new Map();
    this.running = false;
    this._raf = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    this._releaseAllPads();
  }

  hasConnected() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return true;
    return false;
  }

  _onConnect = () => { /* no-op; polling picks it up */ };

  _onDisconnect = (ev) => {
    this._releasePad(ev.gamepad?.index ?? -1);
  };

  _releasePad(idx) {
    const prev = this.state.get(idx);
    if (!prev) return;
    for (const [bi, binding] of Object.entries(BUTTON_BINDINGS)) {
      if (prev.buttons[bi]) this.input.release(binding);
    }
    for (const dir of ['up','down','left','right']) {
      if (prev.stick[dir]) this.input.release(STICK_BINDINGS['left_' + dir]);
    }
    this.state.delete(idx);
  }

  _releaseAllPads() {
    for (const idx of Array.from(this.state.keys())) this._releasePad(idx);
  }

  _tick = () => {
    if (!this.running) return;
    this._poll();
    this._raf = requestAnimationFrame(this._tick);
  };

  _poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let anyActivity = false;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) {
        if (this.state.has(i)) this._releasePad(i);
        continue;
      }
      if (this._pollPad(pad)) anyActivity = true;
    }
    if (anyActivity) this.onActivity?.('gamepad');
  }

  _pollPad(pad) {
    const profile = this.getProfile()?.profile;
    if (!profile) return false;

    const prev = this.state.get(pad.index) || {
      buttons: {}, stick: { up: false, down: false, left: false, right: false },
    };
    let activity = false;

    // Buttons
    for (let bi = 0; bi < pad.buttons.length; bi++) {
      const binding = BUTTON_BINDINGS[bi];
      if (!binding) continue;
      const pressed = !!pad.buttons[bi]?.pressed;
      const was = !!prev.buttons[bi];
      if (pressed !== was) {
        const spec = profile.gamepad[binding];
        if (pressed) {
          if (spec) this.input.press(binding, spec);
          activity = true;
        } else {
          this.input.release(binding);
        }
      }
      prev.buttons[bi] = pressed;
    }

    // Left stick → digital d-pad with hysteresis
    const cfg = profile.axes?.left_stick;
    if (cfg && cfg.mode === 'dpad' && pad.axes.length >= 2) {
      const enter = cfg.deadzone_enter ?? 0.5;
      const exit  = cfg.deadzone_exit  ?? 0.35;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;

      const next = {
        left:  x < 0 ? evalAxis(-x, prev.stick.left,  enter, exit) : false,
        right: x > 0 ? evalAxis( x, prev.stick.right, enter, exit) : false,
        up:    y < 0 ? evalAxis(-y, prev.stick.up,    enter, exit) : false,
        down:  y > 0 ? evalAxis( y, prev.stick.down,  enter, exit) : false,
      };

      for (const dir of ['up','down','left','right']) {
        const binding = STICK_BINDINGS['left_' + dir];
        if (next[dir] !== prev.stick[dir]) {
          if (next[dir]) {
            const spec = profile.gamepad[binding];
            if (spec) this.input.press(binding, spec);
            activity = true;
          } else {
            this.input.release(binding);
          }
        }
      }
      prev.stick = next;
    }

    this.state.set(pad.index, prev);
    return activity;
  }
}

function evalAxis(magnitude, wasActive, enter, exit) {
  return wasActive ? magnitude > exit : magnitude > enter;
}
