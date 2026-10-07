const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];

export function createInput() {
  const held = new Set();
  const latched = new Set();          // premuti in questo frame (edge)
  const lastRepeat = {};              // ultimo istante di ripetizione per slot

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const repeat = (slot, every) => {
    const t = now();
    if (t - (lastRepeat[slot] || -9) >= every) { lastRepeat[slot] = t; return true; }
    return false;
  };

  const isLeft = () => held.has('ArrowLeft') || held.has('KeyA');
  const isRight = () => held.has('ArrowRight') || held.has('KeyD');
  const isHeldUp = () => JUMP_KEYS.some(k => held.has(k));
  const isHeldDown = () => held.has('ArrowDown') || held.has('KeyS');

  const api = {
    setKey(code, pressed) {
      const was = held.has(code);
      if (pressed) { if (!was) latched.add(code); held.add(code); }
      else held.delete(code);
    },
    axis() { return (isRight() ? 1 : 0) - (isLeft() ? 1 : 0); },
    isUp() { return isHeldUp(); },
    isDown() { return isHeldDown(); },
    consume(code) { if (latched.has(code)) { latched.delete(code); return true; } return false; },
    consumeJump() {
      for (const k of JUMP_KEYS) if (latched.has(k)) { latched.delete(k); return true; }
      return false;
    },
    // Arrampicata: un tocco = un passo, ma TENENDO premuto l'azione si ripete.
    // (Prima tenere la freccia non faceva nulla: sembrava rotto.)
    climbActions() {
      const out = {
        left: api.consume('ArrowLeft') || api.consume('KeyA'),
        right: api.consume('ArrowRight') || api.consume('KeyD'),
        up: api.consume('ArrowUp') || api.consume('KeyW') || api.consume('Space'),
        down: api.consume('ArrowDown') || api.consume('KeyS'),
      };
      const LAT = 0.14, VERT = 0.22;
      if (isLeft() && repeat('latL', LAT)) out.left = true;
      if (isRight() && repeat('latR', LAT)) out.right = true;
      if (isHeldUp() && repeat('vertUp', VERT)) out.up = true;
      if (isHeldDown() && repeat('vertDn', VERT)) out.down = true;
      return out;
    },
    attach(win) {
      win.addEventListener('keydown', e => { api.setKey(e.code, true); });
      win.addEventListener('keyup', e => { api.setKey(e.code, false); });
    },
    attachTouch(root) {
      const map = [['btn-left','ArrowLeft'],['btn-right','ArrowRight'],
                   ['btn-up','ArrowUp'],['btn-down','ArrowDown']];
      for (const [id, key] of map) {
        const el = root.querySelector('#' + id);
        if (!el) continue;
        const on = e => { e.preventDefault(); api.setKey(key, true); };
        const off = e => { e.preventDefault(); api.setKey(key, false); };
        el.addEventListener('pointerdown', on);
        el.addEventListener('pointerup', off);
        el.addEventListener('pointercancel', off);
        el.addEventListener('pointerleave', off);
      }
    },
  };
  return api;
}
