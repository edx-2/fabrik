/* Fabrik — world generation & terrain rendering.
 * Deterministic from the seed word. Produces a biome map and resource nodes. */
var FAB = window.FAB || (window.FAB = {});

FAB.World = function (seed) {
  this.seed = seed || 'fabrik';
  this.w = FAB.MAP_W;
  this.h = FAB.MAP_H;
  this.biome = new Array(this.w * this.h);   // biome id per tile
  this.nodes = {};                            // "x,y" -> { res, amount }
  this.decor = {};                            // "x,y" -> glyph (trees/flowers/rocks)
  this.generate();
};

FAB.World.prototype.idx = function (x, y) { return y * this.w + x; };
FAB.World.prototype.inBounds = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };

// Continuous biome classifier — works at any (fractional) coordinate because the
// underlying noise is continuous. Used both to fill the tile grid and (in the
// renderer) to draw smooth, curved boundaries that aren't locked to tile edges.
FAB.World.prototype.classifyBiome = function (fx, fy) {
  if (!this._n1) { this._n1 = FAB.makeNoise(this.seed + ':b1'); this._n2 = FAB.makeNoise(this.seed + ':b2'); }
  var cx = this.w / 2, cy = this.h / 2;
  var e = this._n1(fx * 0.045, fy * 0.045);
  var m = this._n2(fx * 0.06 + 10, fy * 0.06 + 10);
  var d2 = FAB.dist2(fx, fy, cx, cy);
  if (d2 < 14 * 14) return 'meadow';               // gentle spawn area
  if (e < 0.30) return 'lake';
  if (e > 0.72 && m > 0.5) return 'rocky';
  if (e > 0.68 && m <= 0.5) return 'quarry';
  if (m < 0.32 && e < 0.5) return 'marsh';
  if (m > 0.70 && e < 0.6) return 'forest';
  if (Math.sqrt(d2) / (this.w * 0.5) > 0.82) return 'rainbow';
  return 'meadow';
};

FAB.World.prototype.generate = function () {
  var rng = FAB.makeRng(this.seed + ':world');
  var cx = this.w / 2, cy = this.h / 2;

  for (var y = 0; y < this.h; y++) {
    for (var x = 0; x < this.w; x++) {
      this.biome[this.idx(x, y)] = this.classifyBiome(x, y);
    }
  }

  // resource patches: scatter blobs of each resource within its biome
  this.scatter('iron_ore', 'rocky', 9, 4, rng);
  this.scatter('copper_ore', 'rocky', 7, 4, rng);
  this.scatter('coal', 'rocky', 7, 4, rng);
  this.scatter('stone', 'quarry', 8, 5, rng);
  this.scatter('wood', 'forest', 60, 1, rng);     // lots of single trees
  this.scatter('crude_oil', 'marsh', 6, 2, rng);

  // guarantee a friendly starter iron + coal patch near spawn
  this.blob(((cx) | 0) + 6, ((cy) | 0) - 3, 'iron_ore', 3, rng);
  this.blob(((cx) | 0) - 7, ((cy) | 0) + 4, 'coal', 2, rng);

  // light decoration
  for (var i = 0; i < 1400; i++) {
    var dx = (rng() * this.w) | 0, dy = (rng() * this.h) | 0;
    var bb = this.biome[this.idx(dx, dy)];
    if (this.nodes[FAB.key(dx, dy)]) continue;
    if (bb === 'meadow' && rng() < 0.5) this.decor[FAB.key(dx, dy)] = rng() < 0.5 ? '🌼' : '🌷';
    else if (bb === 'forest' && rng() < 0.4) this.decor[FAB.key(dx, dy)] = '🌳';
    else if (bb === 'rocky' && rng() < 0.3) this.decor[FAB.key(dx, dy)] = '🪨';
    else if (bb === 'rainbow' && rng() < 0.4) this.decor[FAB.key(dx, dy)] = '🌈';
  }
};

FAB.World.prototype.scatter = function (res, biome, patches, radius, rng) {
  var placed = 0, tries = 0;
  while (placed < patches && tries < patches * 40) {
    tries++;
    var x = (rng() * this.w) | 0, y = (rng() * this.h) | 0;
    if (this.biome[this.idx(x, y)] !== biome) continue;
    this.blob(x, y, res, radius, rng);
    placed++;
  }
};

FAB.World.prototype.blob = function (x, y, res, radius, rng) {
  var r2 = radius * radius;
  for (var oy = -radius; oy <= radius; oy++) {
    for (var ox = -radius; ox <= radius; ox++) {
      if (ox * ox + oy * oy > r2) continue;
      var nx = x + ox, ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      if (rng() < 0.35) continue;
      var amount = res === 'wood' ? 1 : (60 + ((rng() * 140) | 0));
      this.nodes[FAB.key(nx, ny)] = { res: res, amount: amount };
    }
  }
};

FAB.World.prototype.biomeAt = function (x, y) {
  if (!this.inBounds(x, y)) return 'lake';
  return this.biome[this.idx(x, y)];
};

// Continuous biome lookup for smooth rendering. Classifies directly from the
// continuous noise (so boundaries are smooth iso-contours, NOT tile-aligned
// steps), with a gentle domain warp added for extra organic curviness. Gameplay
// still uses the tile grid, so nothing else changes.
FAB.World.prototype.biomeAtFine = function (fx, fy) {
  if (!this._wa) { this._wa = FAB.makeNoise(this.seed + ':warpA'); this._wb = FAB.makeNoise(this.seed + ':warpB'); }
  var lo = 0.09, hi = 0.26;
  var wx = fx
    + 1.4 * (this._wa(fx * lo, fy * lo) - 0.5)
    + 0.6 * (this._wa(fx * hi + 5.2, fy * hi) - 0.5);
  var wy = fy
    + 1.4 * (this._wb(fx * lo, fy * lo) - 0.5)
    + 0.6 * (this._wb(fx * hi, fy * hi + 5.2) - 0.5);
  return this.classifyBiome(wx, wy);
};
FAB.World.prototype.nodeAt = function (x, y) { return this.nodes[FAB.key(x, y)] || null; };
FAB.World.prototype.isWater = function (x, y) { return this.biomeAt(x, y) === 'lake'; };

// solid for walking? water blocks the player on foot.
FAB.World.prototype.walkable = function (x, y) { return this.inBounds(x, y) && !this.isWater(x, y); };

FAB.World.prototype.serializeNodes = function () { return this.nodes; };
