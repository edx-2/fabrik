/* Fabrik — keyboard + mouse input. */
var FAB = window.FAB || (window.FAB = {});

FAB.Input = function (canvas) {
  this.canvas = canvas;
  this.down = {};        // action -> bool (held)
  this.justPressed = {}; // action -> bool (one frame)
  this.mouse = { x: 0, y: 0, tx: 0, ty: 0, downL: false, downR: false, clickL: false, clickR: false, wheel: 0 };
  this.bindings = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'action', KeyE: 'enter', KeyB: 'build', KeyR: 'rotate', KeyX: 'remove',
    KeyM: 'map', KeyH: 'help', KeyF: 'grapple', KeyO: 'tech', Escape: 'menu', Tab: 'bag',
    Digit1: 'h1', Digit2: 'h2', Digit3: 'h3', Digit4: 'h4', Digit5: 'h5',
    Digit6: 'h6', Digit7: 'h7', Digit8: 'h8', Digit9: 'h9'
  };
  // car uses the same movement keys; handbrake = Space
  var self = this;
  window.addEventListener('keydown', function (e) {
    // never hijack typing in a text field (e.g. the seed/magic-word box)
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var a = self.bindings[e.code];
    if (a) { if (!self.down[a]) self.justPressed[a] = true; self.down[a] = true; if (a !== 'help') e.preventDefault(); }
    if (e.code === 'Space') self.down.handbrake = true;
  });
  window.addEventListener('keyup', function (e) {
    var a = self.bindings[e.code]; if (a) self.down[a] = false;
    if (e.code === 'Space') self.down.handbrake = false;
  });
  canvas.addEventListener('mousemove', function (e) { self._mpos(e); });
  canvas.addEventListener('mousedown', function (e) {
    self._mpos(e);
    if (e.button === 0) { self.mouse.downL = true; self.mouse.clickL = true; }
    if (e.button === 2) { self.mouse.downR = true; self.mouse.clickR = true; }
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) self.mouse.downL = false;
    if (e.button === 2) self.mouse.downR = false;
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) { self.mouse.wheel += (e.deltaY > 0 ? 1 : -1); e.preventDefault(); }, { passive: false });
};

FAB.Input.prototype._mpos = function (e) {
  var r = this.canvas.getBoundingClientRect();
  this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
  this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
};

FAB.Input.prototype.held = function (a) {
  if (a === 'handbrake') return !!this.down.handbrake;
  return !!this.down[a];
};
FAB.Input.prototype.pressed = function (a) { return !!this.justPressed[a]; };

// call once per frame AFTER input is consumed
FAB.Input.prototype.endFrame = function () {
  this.justPressed = {};
  this.mouse.clickL = false; this.mouse.clickR = false; this.mouse.wheel = 0;
};
