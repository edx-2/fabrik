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

FAB.World.prototype.generate = function () {
  var n1 = FAB.makeNoise(this.seed + ':b1');
  var n2 = FAB.makeNoise(this.seed + ':b2');
  var rng = FAB.makeRng(this.seed + ':world');
  var cx = this.w / 2, cy = this.h / 2;

  for (var y = 0; y < this.h; y++) {
    for (var x = 0; x < this.w; x++) {
      var e = n1(x * 0.045, y * 0.045);
      var m = n2(x * 0.06 + 10, y * 0.06 + 10);
      var d = Math.sqrt(FAB.dist2(x, y, cx, cy)) / (this.w * 0.5); // 0 center -> 1 edge
      var b;
      // spawn area is always gentle meadow
      if (FAB.dist2(x, y, cx, cy) < 14 * 14) b = 'meadow';
      else if (e < 0.30) b = 'lake';
      else if (e > 0.72 && m > 0.5) b = 'rocky';
      else if (e > 0.68 && m <= 0.5) b = 'quarry';
      else if (m < 0.32 && e < 0.5) b = 'marsh';
      else if (m > 0.70 && e < 0.6) b = 'forest';
      else if (d > 0.82) b = 'rainbow';
      else b = 'meadow';
      this.biome[this.idx(x, y)] = b;
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

// Continuous biome lookup for smooth rendering: read the discrete biome grid at a
// position that has been pushed around by noise ("domain warp"). This makes the
// boundaries between areas wander as organic curves instead of following the
// square tile grid — without changing gameplay (which still uses the tile grid).
FAB.World.prototype.biomeAtFine = function (fx, fy) {
  if (!this._wa) { this._wa = FAB.makeNoise(this.seed + ':warpA'); this._wb = FAB.makeNoise(this.seed + ':warpB'); }
  var lo = 0.085, hi = 0.27;
  var wx = fx
    + 1.7 * (this._wa(fx * lo, fy * lo) - 0.5)
    + 0.7 * (this._wa(fx * hi + 5.2, fy * hi) - 0.5);
  var wy = fy
    + 1.7 * (this._wb(fx * lo, fy * lo) - 0.5)
    + 0.7 * (this._wb(fx * hi, fy * hi + 5.2) - 0.5);
  return this.biomeAt(Math.round(wx), Math.round(wy));
};
FAB.World.prototype.nodeAt = function (x, y) { return this.nodes[FAB.key(x, y)] || null; };
FAB.World.prototype.isWater = function (x, y) { return this.biomeAt(x, y) === 'lake'; };

// solid for walking? water blocks the player on foot.
FAB.World.prototype.walkable = function (x, y) { return this.inBounds(x, y) && !this.isWater(x, y); };

FAB.World.prototype.serializeNodes = function () { return this.nodes; };
