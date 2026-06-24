'use strict';
/* Loads the game's plain <script> modules under Node with just enough browser
 * shims to construct worlds, factories and a headless Game. No DOM rendering is
 * exercised by the behavioral tests — only simulation/logic. */

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

// ---- browser shims --------------------------------------------------------
if (!global.window) global.window = {};
global.window.FAB = global.window.FAB || {};
global.window.addEventListener = global.window.addEventListener || function () {};
global.window.removeEventListener = global.window.removeEventListener || function () {};
if (!global.performance) global.performance = { now: function () { return 0; } };
global.requestAnimationFrame = global.requestAnimationFrame || function () { return 0; };
global.cancelAnimationFrame = global.cancelAnimationFrame || function () {};
global.Image = global.Image || function () {};

// a recursive no-op 2D context so draw calls are harmless if ever reached
function ctxProxy() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p === 'canvas') return { width: 0, height: 0 };
      if (p === 'measureText') return function () { return { width: 0 }; };
      if (p === 'getImageData' || p === 'createImageData') return function () { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; };
      return function () { return undefined; };
    },
    set: function () { return true; }
  });
}
function stubCanvas(w, h) {
  return {
    width: w || 320, height: h || 240,
    getContext: function () { return ctxProxy(); },
    addEventListener: function () {}, removeEventListener: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: this.width, height: this.height }; },
    toDataURL: function () { return 'data:,'; }
  };
}
if (!global.document) global.document = {};
global.document.createElement = global.document.createElement || function (tag) {
  if (tag === 'canvas') return stubCanvas();
  return { style: {}, appendChild: function () {}, addEventListener: function () {}, classList: { add: function () {}, remove: function () {} } };
};
global.document.getElementById = global.document.getElementById || function () { return null; };
global.document.addEventListener = global.document.addEventListener || function () {};

if (!global.localStorage) {
  var store = {};
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
    key: function (i) { return Object.keys(store)[i]; },
    get length() { return Object.keys(store).length; }
  };
}

// ---- load game modules (FAB.* gets populated on the shared window.FAB) -----
['js/util.js', 'js/data.js', 'js/assets.js', 'js/world.js', 'js/factory.js',
 'js/player.js', 'js/car.js', 'js/input.js', 'js/save.js', 'js/game.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var FAB = global.window.FAB;

// ---- test helpers ---------------------------------------------------------
var _worldCache = {};
function flatWorld(seed) {                       // world with water disabled (placement always allowed)
  seed = seed || 'TEST';
  if (!_worldCache[seed]) { var w = new FAB.World(seed); w.isWater = function () { return false; }; _worldCache[seed] = w; }
  return _worldCache[seed];
}
function newFactory() { return new FAB.Factory(); }

// a lightweight game-like object for factory.tick() and prototype methods
function stubGame(world) {
  world = world || flatWorld();
  var g = {
    world: world, cars: [], driving: null,
    stats: { produced: {}, carColors: {}, carKinds: {}, tutorialsSeen: {} },
    onProduced: FAB.Game.prototype.onProduced,
    carKindCount: FAB.Game.prototype.carKindCount,
    spawnCar: function (e) { this.cars.push({ from: e, color: e.carColor, kind: e.carKind }); }
  };
  g.factory = newFactory();
  return g;
}

// a fully constructed headless Game (for milestones / hotbar / save tests)
function newGame(seed, saved, w, h) {
  var c = stubCanvas(w || 320, h || 240);
  return new FAB.Game(c, seed || 'TEST', saved);
}

function freezeTime(t) { global.performance.now = function () { return t || 0; }; }

module.exports = {
  FAB: FAB, flatWorld: flatWorld, newFactory: newFactory,
  stubGame: stubGame, newGame: newGame, stubCanvas: stubCanvas, freezeTime: freezeTime
};
