/* Fabrik — main game: state, update/render loop, placement, milestones.
 * Unlocked machines are free to place (kid-friendly). Mining/smelting still
 * matters because car PARTS consume real materials. */
var FAB = window.FAB || (window.FAB = {});

FAB.Game = function (canvas, seed, saved) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.seed = seed;
  this.world = new FAB.World(seed);
  this.factory = new FAB.Factory();
  this.input = new FAB.Input(canvas);
  this.cam = { x: 0, y: 0 };
  this.cars = [];
  this.props = [];
  this.toasts = [];
  this.stats = { produced: {}, carColors: {} };
  this.unlocked = {};
  this.milestoneIndex = 0;
  this.buildType = null;
  this.buildDir = 1;
  this.driving = null;       // current Car being driven, or null
  this.acc = 0;              // tick accumulator
  this.celebrate = 0;

  var spawnTX = (this.world.w / 2) | 0, spawnTY = (this.world.h / 2) | 0;
  this.player = new FAB.Player(spawnTX, spawnTY);

  // unlock milestone-1 machines to start
  this.applyUnlocks(FAB.MILESTONES[0].unlock);

  if (saved) this.loadFrom(saved); else this.seedProps(spawnTX, spawnTY);
  this.rebuildHotbar();
};

// ---------------------------------------------------------------- unlocks
FAB.Game.prototype.applyUnlocks = function (list) {
  var self = this; (list || []).forEach(function (t) { self.unlocked[t] = true; });
};
FAB.Game.prototype.rebuildHotbar = function () {
  var order = ['drill', 'belt', 'grabber', 'furnace', 'assembler', 'crusher', 'sawmill', 'pump', 'pipe', 'refinery', 'box', 'car_factory', 'parking'];
  this.hotbar = order.filter(function (t) { return this.unlocked[t]; }, this).slice(0, 9);
};

// ---------------------------------------------------------------- props (grappler fun)
FAB.Game.prototype.seedProps = function (tx, ty) {
  var rng = FAB.makeRng(this.seed + ':props');
  var kinds = ['🪨', '🪵', '💎', '⚽'];
  for (var i = 0; i < 14; i++) {
    var a = rng() * Math.PI * 2, r = 80 + rng() * 360;
    this.props.push({ x: tx * FAB.TILE + Math.cos(a) * r, y: ty * FAB.TILE + Math.sin(a) * r, glyph: kinds[(rng() * kinds.length) | 0] });
  }
};

// ---------------------------------------------------------------- stats hooks
FAB.Game.prototype.onProduced = function (item, qty, meta) {
  this.stats.produced[item] = (this.stats.produced[item] || 0) + qty;
  if (item === 'car' && meta && meta.color) this.stats.carColors[meta.color] = true;
};
FAB.Game.prototype.boxItemCount = function (item) {
  var n = 0; this.factory.eachEntity(function (e) { if (e.kind === 'box') n += (e.store[item] || 0); }); return n;
};
FAB.Game.prototype.distinctCarColors = function () { return Object.keys(this.stats.carColors).length; };

FAB.Game.prototype.toast = function (msg) { this.toasts.push({ msg: msg, t: 2.2 }); if (this.toasts.length > 5) this.toasts.shift(); };

// ---------------------------------------------------------------- movement queries
FAB.Game.prototype.canWalk = function (px, py) {
  return this.world.walkable(Math.floor(px / FAB.TILE), Math.floor(py / FAB.TILE));
};
FAB.Game.prototype.canDrive = function (px, py) {
  var tx = Math.floor(px / FAB.TILE), ty = Math.floor(py / FAB.TILE);
  return this.world.inBounds(tx, ty) && !this.world.isWater(tx, ty);
};

// ---------------------------------------------------------------- car delivery
FAB.Game.prototype.spawnCar = function (factoryEnt) {
  var p = this.factory.nearestParking(factoryEnt.x, factoryEnt.y);
  var px, py;
  if (p) { px = (p.x + p.size / 2) * FAB.TILE; py = (p.y + p.size / 2) * FAB.TILE; }
  else { px = (factoryEnt.x + 1) * FAB.TILE; py = (factoryEnt.y + 3) * FAB.TILE; }
  // scatter multiple cars a little so they do not stack exactly
  px += (this.cars.length % 3) * 26 - 26;
  this.cars.push(new FAB.Car(px, py, factoryEnt.carColor, factoryEnt.carKind));
  this.toast('🚗 A ' + factoryEnt.carColor + ' car is ready! Press E to drive.');
  this.celebrate = 1.5;
};

// ---------------------------------------------------------------- milestones
FAB.Game.prototype.currentMilestone = function () { return FAB.MILESTONES[this.milestoneIndex] || null; };
FAB.Game.prototype.checkMilestone = function () {
  var m = this.currentMilestone(); if (!m) return;
  var g = m.goal(this);
  if (g.have >= g.need) {
    this.milestoneIndex++;
    var nm = FAB.MILESTONES[this.milestoneIndex];
    if (nm) this.applyUnlocks(nm.unlock);
    this.rebuildHotbar();
    this.celebrate = 2.5;
    this.toast('🎉 Milestone ' + m.n + ' complete: ' + m.title + '!');
    FAB.Save.save(this);
  }
};

// ---------------------------------------------------------------- update
FAB.Game.prototype.update = function (dt) {
  dt = Math.min(dt, 0.05);
  // enter / exit car
  if (this.input.pressed('enter')) this.toggleDrive();

  if (this.driving) this.driving.update(dt, this);
  else { this.player.update(dt, this); this.handleBuild(); }

  // factory ticks at fixed rate
  this.acc += dt;
  var step = 1 / FAB.TICK_HZ, guard = 0;
  while (this.acc >= step && guard < 6) { this.factory.tick(this); this.acc -= step; guard++; }

  // camera follows focus
  var f = this.driving || this.player;
  var vw = this.canvas.width, vh = this.canvas.height;
  this.cam.x = FAB.clamp(f.x - vw / 2, 0, this.world.w * FAB.TILE - vw);
  this.cam.y = FAB.clamp(f.y - vh / 2, 0, this.world.h * FAB.TILE - vh);

  // toasts + celebrate timers
  for (var i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].t -= dt; if (this.toasts[i].t <= 0) this.toasts.splice(i, 1); }
  if (this.celebrate > 0) this.celebrate -= dt;

  this.checkMilestone();

  // autosave every ~10s
  this._saveT = (this._saveT || 0) + dt;
  if (this._saveT > 10) { this._saveT = 0; FAB.Save.save(this); }
};

FAB.Game.prototype.toggleDrive = function () {
  if (this.driving) { this.player.x = this.driving.x; this.player.y = this.driving.y + 8; this.driving = null; this.toast('Got out of the car.'); return; }
  var best = null, bd = 70 * 70;
  for (var i = 0; i < this.cars.length; i++) { var d = FAB.dist2(this.player.x, this.player.y, this.cars[i].x, this.cars[i].y); if (d < bd) { bd = d; best = this.cars[i]; } }
  if (best) { this.driving = best; this.toast('Vroom! Arrows to drive' + (best.hasGrappler ? ', F = grappler' : '') + '. E to get out.'); }
};

// ---------------------------------------------------------------- build / interact
FAB.Game.prototype.mouseTile = function () {
  return { x: Math.floor((this.input.mouse.x + this.cam.x) / FAB.TILE), y: Math.floor((this.input.mouse.y + this.cam.y) / FAB.TILE) };
};
FAB.Game.prototype.handleBuild = function () {
  var inp = this.input;
  // hotbar selection by number key
  for (var i = 1; i <= 9; i++) if (inp.pressed('h' + i)) {
    var t = this.hotbar[i - 1];
    this.buildType = (this.buildType === t) ? null : t;
  }
  if (inp.pressed('rotate')) this.buildDir = (this.buildDir + 1) & 3;
  if (inp.mouse.wheel) this.buildDir = (this.buildDir + (inp.mouse.wheel > 0 ? 1 : 3)) & 3;

  var mt = this.mouseTile();
  // remove with X or right-click
  if ((inp.pressed('remove') || inp.mouse.clickR)) this.removeAt(mt.x, mt.y);

  // left click: place, or interact with existing machine
  if (inp.mouse.clickL) {
    if (this.buildType) this.placeAt(mt.x, mt.y);
    else {
      var e = this.factory.at(mt.x, mt.y);
      if (e && (e.kind === 'crafter' || e.kind === 'refinery')) FAB.UI.openRecipe(this, e);
    }
  }
  if (inp.pressed('menu')) this.buildType = null;
};

FAB.Game.prototype.placeAt = function (x, y) {
  if (!this.buildType) return;
  if (!this.unlocked[this.buildType]) return;
  if (!this.factory.canPlace(this.buildType, x, y, this.world)) { this.toast('Can\'t build there'); return; }
  var dir = FAB.MACHINES[this.buildType].rotates ? this.buildDir : 0;
  this.factory.place(this.buildType, x, y, dir, this.world);
};
FAB.Game.prototype.removeAt = function (x, y) {
  var refunds = this.factory.remove(x, y);
  if (refunds) { for (var it in refunds) if (FAB.ITEMS[it]) this.player.give(it, refunds[it]); }
};

// ---------------------------------------------------------------- save/load
FAB.Game.prototype.loadFrom = function (d) {
  var self = this;
  this.player.x = d.player.x; this.player.y = d.player.y; this.player.inv = d.player.inv || {};
  this.stats = d.stats || { produced: {}, carColors: {} };
  this.milestoneIndex = d.milestone || 0;
  (d.unlocked || []).forEach(function (t) { self.unlocked[t] = true; });
  (d.ents || []).forEach(function (s) {
    if (!self.factory.canPlace(s.t, s.x, s.y, self.world)) {
      // tile may be a node the saved miner sits on — force place
    }
    var e = self.factory.place(s.t, s.x, s.y, s.dir, self.world);
    if (!e) return;
    e.recipe = s.recipe; e.inBuf = s.inBuf || {}; e.outBuf = s.outBuf || {};
    e.store = s.store || {}; e.carColor = s.carColor || 'red'; e.carKind = s.carKind || 'basic';
    if (s.items) e.items = s.items;
  });
  (d.cars || []).forEach(function (c) { var car = new FAB.Car(c.x, c.y, c.color, c.kind); car.angle = c.angle || -Math.PI / 2; self.cars.push(car); });
  this.seedProps((this.world.w / 2) | 0, (this.world.h / 2) | 0);
};

// ---------------------------------------------------------------- render
FAB.Game.prototype.render = function () {
  var ctx = this.ctx, vw = this.canvas.width, vh = this.canvas.height, T = FAB.TILE;
  var cam = this.cam;
  var x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T);
  var x1 = x0 + Math.ceil(vw / T) + 1, y1 = y0 + Math.ceil(vh / T) + 1;

  // terrain: blit pre-baked, smoothly-blended chunk canvases (no blocky squares)
  ctx.fillStyle = '#23364a'; ctx.fillRect(0, 0, vw, vh); // backdrop for out-of-bounds
  var CH = FAB.CHUNK, cs = CH * T;
  var cc0x = Math.floor(x0 / CH), cc0y = Math.floor(y0 / CH);
  var cc1x = Math.floor(x1 / CH), cc1y = Math.floor(y1 / CH);
  for (var ccy = cc0y; ccy <= cc1y; ccy++) for (var ccx = cc0x; ccx <= cc1x; ccx++) {
    var ch = this.getTerrainChunk(ccx, ccy);
    if (ch) ctx.drawImage(ch, ccx * cs - cam.x, ccy * cs - cam.y);
  }

  // resource nodes + decoration, drawn crisply on top of the smooth ground
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    if (!this.world.inBounds(x, y)) continue;
    var node = this.world.nodeAt(x, y);
    if (node) this.drawNode(ctx, node, x * T - cam.x, y * T - cam.y);
    else { var dec = this.world.decor[FAB.key(x, y)]; if (dec) { ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dec, x * T - cam.x + T / 2, y * T - cam.y + T / 2); } }
  }

  // factory entities, drawn in layers so nothing covers belt cargo:
  //   1) all belt BODIES   2) all belt ITEMS   3) machines/pipes/arms on top
  var self = this, belts = [], others = [];
  this.factory.eachEntity(function (e) {
    if (e.x + e.size < x0 || e.x > x1 || e.y + e.size < y0 || e.y > y1) return;
    if (e.kind === 'belt') belts.push(e); else others.push(e);
  });
  belts.forEach(function (e) { self.drawBeltBody(ctx, e); });
  belts.forEach(function (e) { self.drawBeltItems(ctx, e); });
  others.forEach(function (e) { self.drawEntity(ctx, e); });

  // props
  this.props.forEach(function (p) {
    ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.glyph, p.x - cam.x, p.y - cam.y);
  });

  // cars
  this.cars.forEach(function (c) { self.drawCar(ctx, c); });

  // player (hidden while driving)
  if (!this.driving) this.drawPlayer(ctx);

  // build ghost
  if (this.buildType && !this.driving) this.drawGhost(ctx);

  // celebrate confetti
  if (this.celebrate > 0) this.drawConfetti(ctx);
};

// ---------------------------------------------------------------- smooth terrain
// A reusable offscreen canvas, fetched by name and (re)sized as needed. Setting
// the width clears it, which is exactly what we want for scratch buffers.
FAB.Game.prototype._scratch = function (name, w, h) {
  this._cv = this._cv || {};
  var c = this._cv[name] || (this._cv[name] = document.createElement('canvas'));
  c.width = w; c.height = h;
  return c;
};

// ids of ground textures available for a biome (base + numbered variants).
FAB.Game.prototype.tileVariants = function (bid) {
  var out = [], base = 'tile_' + bid;
  if (FAB.Assets.has(base)) out.push(base);
  for (var n = 2; n <= 4; n++) if (FAB.Assets.has(base + '_' + n)) out.push(base + '_' + n);
  return out;
};

// Tile a texture across a chunk-sized context, aligned to the global tile grid so
// the pattern is continuous across chunks.
FAB.Game.prototype._tileFill = function (dctx, id, cs) {
  var img = FAB.Assets.imgs[id];
  if (!img) return;
  var span = FAB.TILE * 2; // each copy covers 2x2 tiles, so the pattern repeats less often
  for (var yy = 0; yy < cs; yy += span) for (var xx = 0; xx < cs; xx += span)
    dctx.drawImage(img, 0, 0, img.width, img.height, xx, yy, span, span);
};

// Bake one terrain chunk:
//   1) sample a domain-warped biome field at sub-tile resolution (curved borders)
//   2) paint a smooth colour base from that field
//   3) splat each biome's seamless texture through a soft curved mask, blending a
//      second variant in with low-frequency noise for diversity
// Cached; rebaked only when textures stream in.
FAB.Game.prototype.getTerrainChunk = function (ccx, ccy) {
  if (typeof document === 'undefined') return null;
  if (!this.terrainChunks) { this.terrainChunks = {}; this._chunkKeys = []; }
  var key = ccx + ',' + ccy, ver = FAB.Assets.terrainVersion || 0;
  var cached = this.terrainChunks[key];
  if (cached && cached._texVer === ver) return cached;

  var self = this, w = this.world, T = FAB.TILE, CH = FAB.CHUNK, cs = CH * T;
  var STEP = 4, G = cs / STEP;                 // field resolution: one sample / 4px
  if (!this._biomeIds) { this._biomeIds = Object.keys(FAB.BIOMES); this._biomeRGB = {}; for (var k in FAB.BIOMES) this._biomeRGB[k] = FAB.hex2rgb(FAB.BIOMES[k].ground); }
  if (!this._varNoise) this._varNoise = FAB.makeNoise(this.seed + ':variant');

  // 1) warped biome field (G x G) + which biomes appear here
  var field = new Array(G * G), present = {};
  for (var gj = 0; gj < G; gj++) for (var gi = 0; gi < G; gi++) {
    var tileX = (ccx * cs + gi * STEP + STEP / 2) / T, tileY = (ccy * cs + gj * STEP + STEP / 2) / T;
    var bid = w.biomeAtFine(tileX, tileY);
    field[gj * G + gi] = bid; present[bid] = true;
  }

  // 2) smooth colour base from the field (curved boundaries, only ~4px soft)
  var base = this._scratch('fieldSmall', G, G), bctx = base.getContext('2d');
  var bimg = bctx.createImageData(G, G);
  for (var p = 0; p < field.length; p++) { var c = this._biomeRGB[field[p]], o = p * 4; bimg.data[o] = c[0]; bimg.data[o + 1] = c[1]; bimg.data[o + 2] = c[2]; bimg.data[o + 3] = 255; }
  bctx.putImageData(bimg, 0, 0);

  var canvas = document.createElement('canvas'); canvas.width = cs; canvas.height = cs;
  var cx = canvas.getContext('2d');
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(base, 0, 0, G, G, 0, 0, cs, cs);

  // 3) texture splat per biome present
  Object.keys(present).forEach(function (bid) {
    var variants = self.tileVariants(bid);
    if (!variants.length) return;

    // soft curved mask for this biome (G x G alpha -> upscaled)
    var mask = self._scratch('maskSmall', G, G), mctx = mask.getContext('2d');
    var mimg = mctx.createImageData(G, G);
    for (var q = 0; q < field.length; q++) { mimg.data[q * 4 + 3] = field[q] === bid ? 255 : 0; }
    mctx.putImageData(mimg, 0, 0);

    // build the biome's textured layer at full resolution
    var layer = self._scratch('layer', cs, cs), lctx = layer.getContext('2d');
    lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, cs, cs);
    self._tileFill(lctx, variants[0], cs);
    // blend each extra variant in soft low-frequency blobs (noise uses world coords,
    // so blobs are continuous across chunk borders -> no seams), for diversity.
    for (var vi = 1; vi < variants.length; vi++) {
      var v2 = self._scratch('v2', cs, cs), v2c = v2.getContext('2d');
      v2c.globalCompositeOperation = 'source-over'; v2c.clearRect(0, 0, cs, cs);
      self._tileFill(v2c, variants[vi], cs);
      var bm = self._scratch('blobSmall', G, G), bmc = bm.getContext('2d'), bmi = bmc.createImageData(G, G), off = vi * 31.7;
      for (var r2 = 0; r2 < G; r2++) for (var s2 = 0; s2 < G; s2++) {
        var nx = (ccx * cs + s2 * STEP) / T, ny = (ccy * cs + r2 * STEP) / T;
        var nv = self._varNoise(nx * 0.16 + off, ny * 0.16 + off);
        bmi.data[(r2 * G + s2) * 4 + 3] = Math.round(FAB.clamp((nv - 0.52) / 0.16, 0, 1) * 255);
      }
      bmc.putImageData(bmi, 0, 0);
      v2c.globalCompositeOperation = 'destination-in';
      v2c.imageSmoothingEnabled = true; v2c.drawImage(bm, 0, 0, G, G, 0, 0, cs, cs);
      lctx.drawImage(v2, 0, 0);
    }
    // clip the layer to the curved biome mask, then stamp onto the chunk
    lctx.globalCompositeOperation = 'destination-in';
    lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(mask, 0, 0, G, G, 0, 0, cs, cs);
    lctx.globalCompositeOperation = 'source-over';
    cx.drawImage(layer, 0, 0);
  });

  // gentle grain so flat areas have life
  var rng = FAB.makeRng(this.seed + ':chunk:' + key);
  cx.globalAlpha = 0.045;
  for (var s = 0; s < CH * CH * 2; s++) { cx.fillStyle = rng() < 0.5 ? '#000' : '#fff'; cx.beginPath(); cx.arc(rng() * cs, rng() * cs, 1 + rng() * 1.4, 0, 6.283); cx.fill(); }
  cx.globalAlpha = 1;

  canvas._texVer = ver;
  if (!cached) { this._chunkKeys.push(key); if (this._chunkKeys.length > 96) { var old = this._chunkKeys.shift(); delete this.terrainChunks[old]; } }
  this.terrainChunks[key] = canvas;
  return canvas;
};

FAB.Game.prototype.drawNode = function (ctx, node, sx, sy) {
  var T = FAB.TILE, it = FAB.ITEMS[node.res];
  ctx.fillStyle = it.color; FAB.roundRect(ctx, sx + 3, sy + 3, T - 6, T - 6, 6); ctx.fill();
  ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(it.icon, sx + T / 2, sy + T / 2 + 1);
};

FAB.Game.prototype.drawEntity = function (ctx, e) {
  var T = FAB.TILE, cam = this.cam, sx = e.x * T - cam.x, sy = e.y * T - cam.y, sz = e.size * T;
  var def = FAB.MACHINES[e.type];
  if (e.kind === 'belt') { this.drawBeltBody(ctx, e); this.drawBeltItems(ctx, e); return; }
  if (e.kind === 'pipe') {
    ctx.fillStyle = '#2f5e36'; FAB.roundRect(ctx, sx + 8, sy + 8, T - 16, T - 16, 4); ctx.fill();
    ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 3; ctx.stroke(); return;
  }
  if (e.kind === 'arm') { this.drawArm(ctx, e, sx, sy); return; }

  // generic machine box
  if (!FAB.Assets.draw(ctx, 'machine_' + e.type, sx, sy, sz, sz, 0))
    FAB.Placeholder.box(ctx, sx, sy, sz, sz, def.color, def.icon);

  // direction arrow for rotatable miners/pumps
  if (def.rotates) this.drawDirArrow(ctx, e, sx, sy, sz);
  // progress bar
  if (e.progress > 0 && e.startTime) {
    var p = 1 - e.progress / e.startTime;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx + 4, sy + sz - 7, sz - 8, 4);
    ctx.fillStyle = '#7be37b'; ctx.fillRect(sx + 4, sy + sz - 7, (sz - 8) * p, 4);
  }
  // recipe icon badge for crafters
  if ((e.kind === 'crafter' || e.kind === 'refinery') && e.recipe) {
    var out = FAB.RECIPES[e.recipe]; var oi = (out.out && typeof out.out === 'string') ? out.out : e.recipe;
    var icon = oi === 'car' ? '🚗' : (FAB.ITEMS[oi] ? FAB.ITEMS[oi].icon : '?');
    ctx.font = '12px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sx + 2, sy + 2, 14, 14);
    ctx.fillText(icon, sx + 3, sy + 3);
  }
};

FAB.Game.prototype.drawDirArrow = function (ctx, e, sx, sy, sz) {
  var d = FAB.DIR[e.dir], cx = sx + sz / 2, cy = sy + sz / 2;
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + d.x * sz * 0.4, cy + d.y * sz * 0.4); ctx.stroke();
  ctx.restore();
};

// Work out whether this belt runs straight or curves, and which side feeds it.
// A neighbour belt at side k feeds INTO this belt when its dir == opposite(k).
// Straight feed (from behind) wins; if exactly one side feeds, we draw a corner.
FAB.Game.prototype.beltShape = function (e) {
  var D = e.dir, back = (D + 2) & 3, left = (D + 3) & 3, right = (D + 1) & 3, f = this.factory;
  function feeds(k, want) {
    var n = f.at(e.x + FAB.DIR[k].x, e.y + FAB.DIR[k].y);
    return n && n.kind === 'belt' && n.dir === want;
  }
  var straight = feeds(back, D);
  var leftFeed = feeds(left, right);   // belt on our left pointing across into us
  var rightFeed = feeds(right, left);  // belt on our right pointing across into us
  if (straight || (leftFeed && rightFeed) || (!leftFeed && !rightFeed)) return { type: 'straight', from: back };
  return { type: 'corner', from: leftFeed ? left : right };
};

// Returns pointAt(p): the screen point for belt-progress p in [0,1] (entry -> exit),
// following a straight line or a quarter-circle for corners.
FAB.Game.prototype.beltPath = function (e, shape, sx, sy) {
  var T = FAB.TILE, h = T / 2, cx = sx + h, cy = sy + h;
  if (shape.type === 'straight') {
    var d = FAB.DIR[e.dir];
    return function (p) { return { x: cx + d.x * h * (2 * p - 1), y: cy + d.y * h * (2 * p - 1) }; };
  }
  var df = FAB.DIR[shape.from], dd = FAB.DIR[e.dir];
  var ccx = cx + df.x * h + dd.x * h, ccy = cy + df.y * h + dd.y * h; // tile corner = arc centre
  var aIn = Math.atan2(-dd.y, -dd.x), aOut = Math.atan2(-df.y, -df.x);
  var delta = aOut - aIn;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;   // shortest 90-degree sweep
  return function (p) { var a = aIn + delta * p; return { x: ccx + h * Math.cos(a), y: ccy + h * Math.sin(a) }; };
};

// Belt rendering is split into BODY and ITEMS so the render loop can draw every
// belt body first and then every belt's cargo on top — otherwise a neighbouring
// belt's body would paint over the items near the shared edge.
FAB.Game.prototype.drawBeltBody = function (ctx, e) {
  var T = FAB.TILE, sx = e.x * T - this.cam.x, sy = e.y * T - this.cam.y;
  var shape = this.beltShape(e);
  var pointAt = this.beltPath(e, shape, sx, sy);
  var SAMP = shape.type === 'corner' ? 12 : 1, pts = [], i;
  for (i = 0; i <= SAMP; i++) pts.push(pointAt(i / SAMP));

  // 'butt' caps end the stroke flat at the tile edge so neighbouring belts abut
  // seamlessly (round caps poked a half-circle into the next tile). Round joins
  // keep the corner arc smooth.
  function strokePath(w, color, cap) {
    ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = cap || 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
  }

  ctx.save();
  strokePath(T * 0.92, 'rgba(0,0,0,0.16)');      // ground shadow
  strokePath(T * 0.90, '#22252b');               // dark outer frame
  strokePath(T * 0.82, '#5a626e');               // metallic side rails
  strokePath(T * 0.78, '#3a3f48');               // rail inner bevel
  strokePath(T * 0.60, '#2f333b');               // belt rubber surface

  // animated treads scrolling along the belt at the real transport speed
  var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  var N = 4, speed = 1.35; // tiles/sec (BELT_SPEED 0.17 * 8 ticks)
  ctx.lineCap = 'butt';
  for (var k = 0; k < N; k++) {
    var p = ((k / N) + now * speed) % 1;
    var a = pointAt(Math.min(1, p + 0.03)), b = pointAt(Math.max(0, p - 0.03));
    var ang = Math.atan2(a.y - b.y, a.x - b.x);
    var pt = pointAt(p), nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    ctx.strokeStyle = '#646b78'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pt.x - nx * T * 0.29, pt.y - ny * T * 0.29);
    ctx.lineTo(pt.x + nx * T * 0.29, pt.y + ny * T * 0.29);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pt.x - nx * T * 0.29 + Math.cos(ang) * 2, pt.y - ny * T * 0.29 + Math.sin(ang) * 2);
    ctx.lineTo(pt.x + nx * T * 0.29 + Math.cos(ang) * 2, pt.y + ny * T * 0.29 + Math.sin(ang) * 2);
    ctx.stroke();
  }
  strokePath(2, 'rgba(255,255,255,0.06)');       // faint center sheen
  ctx.restore();
};

// Drawn in a second pass (after every belt body) so cargo is never clipped by a
// neighbouring belt. Items follow the same path, so they round corners too.
FAB.Game.prototype.drawBeltItems = function (ctx, e) {
  if (!e.items.length) return;
  var T = FAB.TILE, sx = e.x * T - this.cam.x, sy = e.y * T - this.cam.y;
  var shape = this.beltShape(e);
  var pointAt = this.beltPath(e, shape, sx, sy);
  for (var i = 0; i < e.items.length; i++) {
    var it = e.items[i], item = FAB.ITEMS[it.item];
    var ip = pointAt(FAB.clamp(it.pos, 0, 1));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(ip.x, ip.y + 5, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (!FAB.Assets.draw(ctx, 'item_' + it.item, ip.x - 9, ip.y - 9, 18, 18, 0))
      FAB.Placeholder.token(ctx, ip.x, ip.y, 8, item.color, item.icon);
  }
};

FAB.Game.prototype.drawArm = function (ctx, e, sx, sy) {
  var T = FAB.TILE, cx = sx + T / 2, cy = sy + T / 2;
  var b = FAB.DIR[FAB.opposite(e.dir)];            // rest pose reaches toward the grab side
  var backAngle = Math.atan2(b.y, b.x);
  var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  var phase = e.x * 0.7 + e.y * 1.3;               // de-sync neighbouring arms

  // t = 0 reaching BACK (grab) ... 1 reaching FRONT (drop)
  var working = e.cooldown > 0, t, chomp;
  if (working) {
    var prog = FAB.clamp(1 - e.cooldown / 4, 0, 1);
    t = FAB.clamp(FAB.easeOutBack(prog), -0.1, 1.1); // bouncy snap as it delivers
    chomp = 0.12;                                   // claw grips while carrying
  } else {
    t = 0.06 + 0.05 * Math.sin(now * 3 + phase);    // gentle idle bob near grab pose
    chomp = 0.45 + 0.20 * Math.sin(now * 6 + phase);// claw lazily opens & closes
  }
  var ang = backAngle + t * Math.PI;               // sweep up and over to the drop side
  var reach = T * 0.42 * (1 - 0.25 * Math.sin(FAB.clamp(t, 0, 1) * Math.PI)); // scoop in mid-swing
  var lift = working ? -3 * Math.sin(FAB.clamp(t, 0, 1) * Math.PI) : 0;
  var tipx = cx + Math.cos(ang) * reach, tipy = cy + Math.sin(ang) * reach + lift;

  ctx.save();
  // soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(cx, cy + 9, 9, 4, 0, 0, Math.PI * 2); ctx.fill();

  // springy arm (a bowed curve that flexes more while working)
  var bow = working ? 6 : 2;
  var mx = (cx + tipx) / 2 - Math.sin(ang) * bow;
  var my = (cy + tipy) / 2 + Math.cos(ang) * bow;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e6c45a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, tipx, tipy); ctx.stroke();
  ctx.strokeStyle = '#caa23c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, tipx, tipy); ctx.stroke();

  // shoulder bolt with a little pop when a grab begins
  var pop = working ? 1 + 0.18 * Math.max(0, 1 - t * 2.5) : 1;
  ctx.fillStyle = '#b07d1e'; ctx.beginPath(); ctx.arc(cx, cy, 6.5 * pop, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(cx, cy, 3.6 * pop, 0, Math.PI * 2); ctx.fill();

  // two-prong claw that chomps
  ctx.strokeStyle = '#9a7b16'; ctx.lineWidth = 3;
  for (var s = -1; s <= 1; s += 2) {
    var ca = ang + s * chomp;
    ctx.beginPath(); ctx.moveTo(tipx, tipy); ctx.lineTo(tipx + Math.cos(ca) * 7, tipy + Math.sin(ca) * 7); ctx.stroke();
  }

  // the item being carried across, riding in the claw
  if (working && e.carryItem && t < 0.92) {
    var item = FAB.ITEMS[e.carryItem];
    if (item && !FAB.Assets.draw(ctx, 'item_' + e.carryItem, tipx - 8, tipy - 8, 16, 16, 0))
      if (item) FAB.Placeholder.token(ctx, tipx, tipy, 6, item.color, item.icon);
  }
  ctx.restore();
};

FAB.Game.prototype.drawPlayer = function (ctx) {
  var T = FAB.TILE, sx = this.player.x - this.cam.x, sy = this.player.y - this.cam.y;
  var frame = this.player.moving ? (Math.floor(this.player.animTime * 8) % 4) : 0;
  var dirRow = this.player.dir; // 0 up,1 right,2 down,3 left
  if (!FAB.Assets.draw(ctx, 'player', sx - 16, sy - 24, 32, 36, dirRow * 4 + frame)) {
    ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.ellipse(sx, sy + 14, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    FAB.Placeholder.box(ctx, sx - 10, sy - 18, 20, 28, '#5aa0e0', '');
    ctx.fillStyle = '#ffd9b3'; ctx.beginPath(); ctx.arc(sx, sy - 20, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.fillText('🧒', sx, sy - 18);
  }
  // mining ring
  if (this.player.mineTarget && this.player.mineProgress > 0) {
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy - 6, 16, -Math.PI / 2, -Math.PI / 2 + (this.player.mineProgress / 0.7) * Math.PI * 2); ctx.stroke();
  }
};

FAB.Game.prototype.drawCar = function (ctx, c) {
  var sx = c.x - this.cam.x, sy = c.y - this.cam.y;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(c.angle + Math.PI / 2);
  if (!FAB.Assets.draw(ctx, 'car_' + c.kind, -18, -28, 36, 56, 0)) {
    ctx.fillStyle = c.colorHex(); FAB.roundRect(ctx, -14, -24, 28, 48, 8); ctx.fill();
    ctx.fillStyle = 'rgba(180,230,255,0.85)'; FAB.roundRect(ctx, -10, -16, 20, 12, 4); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(-16, -18, 4, 10); ctx.fillRect(12, -18, 4, 10); ctx.fillRect(-16, 8, 4, 10); ctx.fillRect(12, 8, 4, 10);
    if (c.hasSpoiler) { ctx.fillStyle = '#111'; ctx.fillRect(-14, 22, 28, 5); }
    if (c.hasGrappler) { ctx.fillStyle = '#d23b3b'; ctx.beginPath(); ctx.arc(0, -26, 5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
};

FAB.Game.prototype.drawGhost = function (ctx) {
  var mt = this.mouseTile(), T = FAB.TILE, sz = this.factory.footprint(this.buildType) * T;
  var sx = mt.x * T - this.cam.x, sy = mt.y * T - this.cam.y;
  var ok = this.factory.canPlace(this.buildType, mt.x, mt.y, this.world);
  ctx.save(); ctx.globalAlpha = 0.55;
  FAB.Placeholder.box(ctx, sx, sy, sz, sz, ok ? '#7be37b' : '#e06b6b', FAB.MACHINES[this.buildType].icon);
  if (FAB.MACHINES[this.buildType].rotates) this.drawDirArrow(ctx, { dir: this.buildDir }, sx, sy, sz);
  ctx.restore();
};

FAB.Game.prototype.drawConfetti = function (ctx) {
  var t = Date.now() / 200;
  for (var i = 0; i < 40; i++) {
    var x = (Math.sin(i * 12.9 + t) * 0.5 + 0.5) * this.canvas.width;
    var y = ((i * 37 + t * 60) % this.canvas.height);
    ctx.fillStyle = ['#e74c3c', '#f1c40f', '#3fb56b', '#3a78d6', '#9b59b6'][i % 5];
    ctx.fillRect(x, y, 6, 6);
  }
};

// ---------------------------------------------------------------- loop
FAB.Game.prototype.start = function () {
  var self = this, last = performance.now();
  function frame(now) {
    var dt = (now - last) / 1000; last = now;
    self.update(dt);
    self.render();
    FAB.UI.renderHUD(self);
    self.input.endFrame();
    self._raf = requestAnimationFrame(frame);
  }
  this._raf = requestAnimationFrame(frame);
};
FAB.Game.prototype.stop = function () { if (this._raf) cancelAnimationFrame(this._raf); };
