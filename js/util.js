/* Fabrik — utility helpers, constants, seeded RNG.
 * Everything hangs off the global FAB namespace so the game runs as plain
 * <script> tags straight from the file system (double-click index.html). */
var FAB = window.FAB || (window.FAB = {});

FAB.TILE = 32;            // pixels per tile
FAB.MAP_W = 200;          // tiles wide
FAB.MAP_H = 140;          // tiles tall
FAB.TICK_HZ = 8;          // factory simulation ticks per second

// ---- seeded RNG (mulberry32 + string hashing) -----------------------------
FAB.hashSeed = function (str) {
  str = String(str || 'fabrik');
  var h = 1779033703 ^ str.length;
  for (var i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
};

FAB.makeRng = function (seedStr) {
  var a = FAB.hashSeed(seedStr);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---- small helpers --------------------------------------------------------
FAB.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
FAB.lerp = function (a, b, t) { return a + (b - a) * t; };
FAB.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
FAB.key = function (x, y) { return x + ',' + y; };

// Direction helpers. dir: 0=up,1=right,2=down,3=left
FAB.DIR = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
FAB.DIR_NAME = ['up', 'right', 'down', 'left'];
FAB.opposite = function (d) { return (d + 2) & 3; };

// Simple value-noise for terrain, seeded.
FAB.makeNoise = function (seedStr) {
  var rng = FAB.makeRng(seedStr + ':noise');
  var perm = new Uint8Array(512);
  var p = new Uint8Array(256);
  var i;
  for (i = 0; i < 256; i++) p[i] = i;
  for (i = 255; i > 0; i--) { var j = (rng() * (i + 1)) | 0; var t = p[i]; p[i] = p[j]; p[j] = t; }
  for (i = 0; i < 512; i++) perm[i] = p[i & 255];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad(h, x, y) {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y;
    }
  }
  return function (x, y) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    var u = fade(x), v = fade(y);
    var aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    var ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    var r = FAB.lerp(
      FAB.lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
      FAB.lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v);
    return (r + 1) * 0.5; // 0..1
  };
};

// Rounded-rect path helper used everywhere in placeholder rendering.
FAB.roundRect = function (ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
