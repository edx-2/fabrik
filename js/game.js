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
  this.mapOpen = false;      // big map modal (toggled with M); hidden by default
  this._mmBakeScale = 3;     // resolution the static map is baked at (px per tile)
  this._mmRes = { iron_ore: '#aebfd6', copper_ore: '#e8853f', coal: '#1e1e26', stone: '#efe6c8', wood: '#7a4a22', crude_oil: '#2e2038' };

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
  var order = ['drill', 'belt', 'grabber', 'crossing', 'furnace', 'assembler', 'crusher', 'sawmill', 'pump', 'pipe', 'refinery', 'box', 'road', 'car_factory', 'parking'];
  this.hotbar = order.filter(function (t) { return this.unlocked[t]; }, this); // show everything unlocked
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
  // car emerges from the garage door and drives the road to a free parking spot
  var del = this.factory.carDelivery(factoryEnt, this);
  var dt = this.factory.doorTile(factoryEnt);
  var car = new FAB.Car((dt.x + 0.5) * FAB.TILE, (dt.y + 0.5) * FAB.TILE, factoryEnt.carColor, factoryEnt.carKind);
  if (del) car.deliver = { parking: del.parking, spotIndex: del.spotIndex, path: del.path, i: 0 };
  this.cars.push(car);
  factoryEnt.doorT = (typeof performance !== 'undefined' ? performance.now() : Date.now()); // open the garage
  // first car of each kind+colour gets a friendly toast + sound (no confetti)
  var key = factoryEnt.carKind + ':' + factoryEnt.carColor;
  this.stats.carVariants = this.stats.carVariants || {};
  if (!this.stats.carVariants[key]) {
    this.stats.carVariants[key] = true;
    var kindName = { basic: 'car', sporty: 'sporty car', super: 'super car' }[factoryEnt.carKind] || 'car';
    this.toast('🚗 First ' + factoryEnt.carColor + ' ' + kindName + '! Drive it from the lot (E).');
    FAB.sfx('car_ready');
  } else FAB.sfx('car_ready', { volume: 0.4 });
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
    FAB.sfx('milestone');
    FAB.Save.save(this);
  }
};

// ---------------------------------------------------------------- update
FAB.Game.prototype.update = function (dt) {
  dt = Math.min(dt, 0.05);
  // big map modal: M toggles, Esc closes; it pauses building/movement but the
  // factory keeps running underneath.
  if (this.input.pressed('map')) this.mapOpen = !this.mapOpen;
  if (this.mapOpen && this.input.pressed('menu')) this.mapOpen = false;

  if (!this.mapOpen) {
    if (this.input.pressed('enter')) this.toggleDrive();
    if (this.driving) this.driving.update(dt, this);
    else { this.player.update(dt, this); this.handleBuild(); }
  }

  // factory ticks at fixed rate
  this.acc += dt;
  var step = 1 / FAB.TICK_HZ, guard = 0;
  while (this.acc >= step && guard < 6) { this.factory.tick(this); this.acc -= step; guard++; }

  // drive freshly-built cars from the factory door along the road to their spot
  for (var ci = 0; ci < this.cars.length; ci++) {
    var c = this.cars[ci]; if (!c.deliver) continue;
    var wp = c.deliver.path[c.deliver.i];
    var dx = wp.x - c.x, dy = wp.y - c.y, dd = Math.hypot(dx, dy), sp = 120 * dt;
    if (dd > 0.001) c.angle = Math.atan2(dy, dx);
    if (dd <= sp) { c.x = wp.x; c.y = wp.y; if (++c.deliver.i >= c.deliver.path.length) c.deliver = null; }
    else { c.x += dx / dd * sp; c.y += dy / dd * sp; }
  }

  // camera follows focus
  var f = this.driving || this.player;
  var vw = this.canvas.width, vh = this.canvas.height;
  this.cam.x = FAB.clamp(f.x - vw / 2, 0, this.world.w * FAB.TILE - vw);
  this.cam.y = FAB.clamp(f.y - vh / 2, 0, this.world.h * FAB.TILE - vh);

  // toasts + celebrate timers
  for (var i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].t -= dt; if (this.toasts[i].t <= 0) this.toasts.splice(i, 1); }
  if (this.celebrate > 0) this.celebrate -= dt;

  this.checkMilestone();

  // gentle conveyor hum while any belts exist
  this._beltCheckT = (this._beltCheckT || 0) + dt;
  if (this._beltCheckT > 0.6) {
    this._beltCheckT = 0; var hasBelt = false;
    this.factory.eachEntity(function (e) { if (e.kind === 'belt' || e.kind === 'cross') hasBelt = true; });
    if (hasBelt) FAB.sfxLoop('belt_loop'); else FAB.sfxStop('belt_loop');
  }

  // autosave every ~10s
  this._saveT = (this._saveT || 0) + dt;
  if (this._saveT > 10) { this._saveT = 0; FAB.Save.save(this); }
};

FAB.Game.prototype.toggleDrive = function () {
  if (this.driving) { this.player.x = this.driving.x; this.player.y = this.driving.y + 8; this.driving = null; this.toast('Got out of the car.'); FAB.sfxStop('drive_loop'); return; }
  var best = null, bd = 70 * 70;
  for (var i = 0; i < this.cars.length; i++) { if (this.cars[i].deliver) continue; var d = FAB.dist2(this.player.x, this.player.y, this.cars[i].x, this.cars[i].y); if (d < bd) { bd = d; best = this.cars[i]; } }
  if (best) { this.driving = best; this.toast('Vroom! Arrows to drive' + (best.hasGrappler ? ', F = grappler' : '') + '. E to get out.'); FAB.sfxLoop('drive_loop'); }
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

  // belts, pipes & roads can be click-and-DRAGGED to draw long runs
  var draggable = this.buildType === 'belt' || this.buildType === 'pipe' || this.buildType === 'road';

  if (inp.mouse.clickL) {
    if (this.buildType && draggable) {
      this.dragType = this.buildType; this.dragging = true; this.dragLast = { x: mt.x, y: mt.y };
      this.placeLine(mt.x, mt.y, this.buildDir);
    } else if (this.buildType) {
      this.placeAt(mt.x, mt.y);
    } else {
      var e = this.factory.at(mt.x, mt.y);
      if (e && (e.kind === 'crafter' || e.kind === 'refinery')) FAB.UI.openRecipe(this, e);
    }
  }

  // continue / end an in-progress drag
  if (this.dragging) {
    if (!inp.mouse.downL || !draggable) this.dragging = false;
    else if (mt.x !== this.dragLast.x || mt.y !== this.dragLast.y) this.dragDraw(mt.x, mt.y);
  }

  if (inp.pressed('menu')) { this.buildType = null; this.dragging = false; }
};

// Walk from the last dragged tile to the mouse tile one step at a time, laying a
// belt/pipe in each cell and orienting belts to flow along the drag (corners too).
FAB.Game.prototype.dragDraw = function (tx, ty) {
  var cur = this.dragLast, guard = 0;
  while ((cur.x !== tx || cur.y !== ty) && guard++ < 500) {
    var dx = tx - cur.x, dy = ty - cur.y, dir;
    if (Math.abs(dx) >= Math.abs(dy)) dir = dx > 0 ? 1 : 3; else dir = dy > 0 ? 2 : 0;
    var d = FAB.DIR[dir], nx = cur.x + d.x, ny = cur.y + d.y;
    this.orientBelt(cur.x, cur.y, dir);    // the tile we leave flows toward the next
    this.placeLine(nx, ny, dir);
    this.buildDir = dir;
    cur = { x: nx, y: ny };
  }
  this.dragLast = cur;
};

// place a single belt/pipe of the drag type, or just re-orient one already there
FAB.Game.prototype.placeLine = function (x, y, dir) {
  var t = this.dragType;
  if (!this.unlocked[t]) return;
  var existing = this.factory.at(x, y);
  if (existing) { if (existing.type === t && existing.kind === 'belt') existing.dir = dir; return; }
  if (this.factory.canPlace(t, x, y, this.world)) {
    this.factory.place(t, x, y, FAB.MACHINES[t].rotates ? dir : 0, this.world);
    FAB.sfx('place', { minGap: 70, volume: 0.4, rate: 1.05 }); // soft rhythmic tick while dragging
  }
};
FAB.Game.prototype.orientBelt = function (x, y, dir) {
  var e = this.factory.at(x, y);
  if (e && e.type === this.dragType && e.kind === 'belt') e.dir = dir;
};

FAB.Game.prototype.placeAt = function (x, y) {
  if (!this.buildType) return;
  if (!this.unlocked[this.buildType]) return;
  if (!this.factory.canPlace(this.buildType, x, y, this.world)) { this.toast('Can\'t build there'); FAB.sfx('error', { minGap: 200 }); return; }
  var dir = FAB.MACHINES[this.buildType].rotates ? this.buildDir : 0;
  this.factory.place(this.buildType, x, y, dir, this.world);
  FAB.sfx('place');
};
FAB.Game.prototype.removeAt = function (x, y) {
  var refunds = this.factory.remove(x, y);
  if (refunds) { for (var it in refunds) if (FAB.ITEMS[it]) this.player.give(it, refunds[it]); FAB.sfx('remove'); }
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
    if (s.itemsH) e.itemsH = s.itemsH; if (s.itemsV) e.itemsV = s.itemsV;
    if (s.dirH != null) e.dirH = s.dirH; if (s.dirV != null) e.dirV = s.dirV;
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

  // big map modal (resource finder)
  if (this.mapOpen) this.drawBigMap(ctx);
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
FAB.Game.prototype._tileFill = function (dctx, id, cs, span, ox, oy) {
  var img = FAB.Assets.imgs[id];
  if (!img) return;
  span = span || FAB.TILE * 2;
  ox = ox || 0; oy = oy || 0;
  // align tiling to WORLD space (offset by the chunk's world origin) so the pattern
  // is continuous across chunk borders even for spans that don't divide the chunk.
  var sx = -(((ox % span) + span) % span), sy = -(((oy % span) + span) % span);
  for (var yy = sy; yy < cs; yy += span) for (var xx = sx; xx < cs; xx += span)
    dctx.drawImage(img, 0, 0, img.width, img.height, xx, yy, span, span);
};

// Overlay a texture (tiled at `span`, world-aligned) revealed through soft, coarse
// noise blobs. Used to (a) break the periodic grid by mixing in the SAME texture at
// a different scale, and (b) blend in variant textures for diversity. Because the
// reveal mask is a soft noise blend, there are no hard joins.
FAB.Game.prototype._overlayTexture = function (lctx, id, cs, ox, oy, span, noiseOff) {
  if (!FAB.Assets.imgs[id]) return;
  if (!this._varNoise) this._varNoise = FAB.makeNoise(this.seed + ':variant');
  var T = FAB.TILE, GV = 32;
  var v = this._scratch('ovl', cs, cs), vc = v.getContext('2d');
  vc.globalCompositeOperation = 'source-over'; vc.clearRect(0, 0, cs, cs);
  this._tileFill(vc, id, cs, span, ox, oy);
  var bm = this._scratch('ovlBlob', GV, GV), bmc = bm.getContext('2d'), bmi = bmc.createImageData(GV, GV);
  for (var r = 0; r < GV; r++) for (var s = 0; s < GV; s++) {
    var nx = (ox + (s + 0.5) * cs / GV) / T, ny = (oy + (r + 0.5) * cs / GV) / T;
    var nv = this._varNoise(nx * 0.16 + noiseOff, ny * 0.16 + noiseOff);
    bmi.data[(r * GV + s) * 4 + 3] = Math.round(FAB.clamp((nv - 0.46) / 0.16, 0, 1) * 255);
  }
  bmc.putImageData(bmi, 0, 0);
  vc.globalCompositeOperation = 'destination-in'; vc.imageSmoothingEnabled = true;
  vc.drawImage(bm, 0, 0, GV, GV, 0, 0, cs, cs);
  lctx.drawImage(v, 0, 0);
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
  var STEP = 2, G = cs / STEP;                 // field resolution: one sample / 2px (fine curves)
  var FEATHER = 12;                            // px width of the soft cross-fade between biomes
  var PADC = Math.ceil(FEATHER / STEP) + 2;    // field padding (cells) so the blur has neighbour data
  var GP = G + 2 * PADC;                        // padded field size
  if (!this._biomeIds) { this._biomeIds = Object.keys(FAB.BIOMES); this._biomeRGB = {}; for (var k in FAB.BIOMES) this._biomeRGB[k] = FAB.hex2rgb(FAB.BIOMES[k].ground); }
  if (!this._varNoise) this._varNoise = FAB.makeNoise(this.seed + ':variant');

  // 1) warped biome field, sampled with PADDING so the cross-fade blur near chunk
  //    edges has real neighbour data (no seams). present = biomes in/bordering chunk.
  var field = new Array(GP * GP), present = {};
  for (var gj = 0; gj < GP; gj++) for (var gi = 0; gi < GP; gi++) {
    var tileX = (ccx * cs + (gi - PADC) * STEP + STEP / 2) / T, tileY = (ccy * cs + (gj - PADC) * STEP + STEP / 2) / T;
    var bid = w.biomeAtFine(tileX, tileY);
    field[gj * GP + gi] = bid; present[bid] = true;
  }

  // 2) smooth colour base from the central field cells
  var base = this._scratch('fieldSmall', G, G), bctx = base.getContext('2d');
  var bimg = bctx.createImageData(G, G);
  for (var bj = 0; bj < G; bj++) for (var bi = 0; bi < G; bi++) {
    var c = this._biomeRGB[field[(bj + PADC) * GP + (bi + PADC)]], o = (bj * G + bi) * 4;
    bimg.data[o] = c[0]; bimg.data[o + 1] = c[1]; bimg.data[o + 2] = c[2]; bimg.data[o + 3] = 255;
  }
  bctx.putImageData(bimg, 0, 0);

  var canvas = document.createElement('canvas'); canvas.width = cs; canvas.height = cs;
  var cx = canvas.getContext('2d');
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(base, 0, 0, G, G, 0, 0, cs, cs);

  // 3) texture splat per biome present
  Object.keys(present).forEach(function (bid) {
    var variants = self.tileVariants(bid);
    if (!variants.length) return;

    // padded membership mask for this biome (blurred later for the cross-fade)
    var mask = self._scratch('maskSmall', GP, GP), mctx = mask.getContext('2d');
    var mimg = mctx.createImageData(GP, GP);
    for (var q = 0; q < field.length; q++) { mimg.data[q * 4 + 3] = field[q] === bid ? 255 : 0; }
    mctx.putImageData(mimg, 0, 0);

    // build the biome's textured layer
    var layer = self._scratch('layer', cs, cs), lctx = layer.getContext('2d');
    lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, cs, cs);
    var ox = ccx * cs, oy = ccy * cs;
    self._tileFill(lctx, variants[0], cs, T * 2, ox, oy);                       // base tiling (2-tile span)
    // break the periodic grid: mix in the SAME texture at TWO other scales, so
    // features change size from patch to patch instead of repeating uniformly.
    self._overlayTexture(lctx, variants[0], cs, ox, oy, Math.round(T * 5.0), 23.7);
    self._overlayTexture(lctx, variants[0], cs, ox, oy, Math.round(T * 3.25), 7.3);
    self._overlayTexture(lctx, variants[0], cs, ox, oy, Math.round(T * 1.4), 17.1);
    // blend extra variant textures for colour/detail diversity
    for (var vi = 1; vi < variants.length; vi++)
      self._overlayTexture(lctx, variants[vi], cs, ox, oy, T * 2, vi * 31.7);
    // clip the layer to the biome mask, BLURRED so the texture fades out gradually
    // and overlaps the neighbouring biome -> a soft cross-fade instead of a hard edge
    lctx.globalCompositeOperation = 'destination-in';
    lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
    lctx.filter = 'blur(' + FEATHER + 'px)';
    lctx.drawImage(mask, 0, 0, GP, GP, -PADC * STEP, -PADC * STEP, GP * STEP, GP * STEP);
    lctx.filter = 'none';
    lctx.globalCompositeOperation = 'source-over';
    // slightly translucent so the smooth colour base shows through a touch — mutes
    // any residual tiling grid into gentle detail instead of a hard pattern.
    cx.save(); cx.globalAlpha = 0.82; cx.drawImage(layer, 0, 0); cx.restore();
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
  ctx.save();
  // soft round backing so a patch reads as a deposit (circles blend in clusters)
  ctx.globalAlpha = 0.3; ctx.fillStyle = it.color;
  ctx.beginPath(); ctx.arc(sx + T / 2, sy + T / 2, T * 0.46, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // the SAME generated item image used in menus and on belts, for consistency
  if (!FAB.Assets.draw(ctx, 'item_' + node.res, sx + 4, sy + 4, T - 8, T - 8, 0)) {
    ctx.fillStyle = it.color; FAB.roundRect(ctx, sx + 3, sy + 3, T - 6, T - 6, 6); ctx.fill();
    ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.icon, sx + T / 2, sy + T / 2 + 1);
  }
  ctx.restore();
};

FAB.Game.prototype.drawEntity = function (ctx, e) {
  var T = FAB.TILE, cam = this.cam, sx = e.x * T - cam.x, sy = e.y * T - cam.y, sz = e.size * T;
  var def = FAB.MACHINES[e.type];
  if (e.kind === 'belt') { this.drawBeltBody(ctx, e); this.drawBeltItems(ctx, e); return; }
  if (e.kind === 'pipe') { this.drawPipe(ctx, e, sx, sy); return; }
  if (e.kind === 'cross') { this.drawCross(ctx, e, sx, sy); return; }
  if (e.kind === 'arm') { this.drawArm(ctx, e, sx, sy); return; }
  if (e.kind === 'road') { this.drawRoad(ctx, e, sx, sy); return; }
  if (e.kind === 'parking') { this.drawParking(ctx, e, sx, sy, sz); return; }
  if (e.type === 'car_factory') { this.drawCarFactory(ctx, e, sx, sy, sz); return; }

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
  // "what this machine makes" badge: a clear rounded chip with the output's image
  if ((e.kind === 'crafter' || e.kind === 'refinery') && e.recipe) {
    var out = FAB.RECIPES[e.recipe], oi = (out.out && typeof out.out === 'string') ? out.out : e.recipe;
    var bs = Math.round(Math.min(22, sz * 0.5)), bx = sx + 3, by = sy + 3;
    FAB.roundRect(ctx, bx, by, bs, bs, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    var aid = oi === 'car' ? ('car_' + (out.carKind || 'basic')) : ('item_' + oi);
    if (!FAB.Assets.draw(ctx, aid, bx + 2, by + 2, bs - 4, bs - 4, 0)) {
      ctx.font = Math.floor(bs * 0.66) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#222'; ctx.fillText(oi === 'car' ? '🚗' : (FAB.ITEMS[oi] ? FAB.ITEMS[oi].icon : '?'), bx + bs / 2, by + bs / 2 + 1);
    }
  }
};

// Draw a pipe as a connected piece: a central hub plus an arm toward every
// neighbour it links to (other pipes, pumps, refineries). Adjacent pipes' arms
// meet flush at the shared edge, so a run reads as one continuous pipe. Oil in
// the network shows as an animated flow inside.
FAB.Game.prototype.drawPipe = function (ctx, e, sx, sy) {
  var T = FAB.TILE, cx = sx + T / 2, cy = sy + T / 2, f = this.factory, W = 13;
  var conn = [], edge = [[cx, sy], [sx + T, cy], [cx, sy + T], [sx, cy]]; // up,right,down,left
  for (var d = 0; d < 4; d++) {
    var n = f.at(e.x + FAB.DIR[d].x, e.y + FAB.DIR[d].y);
    conn[d] = !!(n && (n.kind === 'pipe' || n.kind === 'pump' || n.kind === 'refinery'));
  }
  function arms() {
    ctx.beginPath(); var drew = false;
    for (var d = 0; d < 4; d++) if (conn[d]) { ctx.moveTo(cx, cy); ctx.lineTo(edge[d][0], edge[d][1]); drew = true; }
    if (!drew) { ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy); } // isolated: short stub
  }
  // oil level for this pipe's connected group
  var gi = f.cellGroup[FAB.key(e.x, e.y)], grp = (gi !== undefined) ? f.groups[gi] : null, oil = grp && grp.oil > 0;

  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  arms(); ctx.lineWidth = W + 5; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.stroke();   // shadow
  arms(); ctx.lineWidth = W + 2; ctx.strokeStyle = '#26512f'; ctx.stroke();             // dark border
  arms(); ctx.lineWidth = W; ctx.strokeStyle = '#3f8a4e'; ctx.stroke();                 // pipe body
  arms(); ctx.lineWidth = W - 6;                                                        // inner core
  if (oil) {
    ctx.strokeStyle = '#3b2b46'; ctx.stroke();
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    arms(); ctx.lineWidth = W - 8; ctx.strokeStyle = 'rgba(190,160,220,0.75)';
    ctx.setLineDash([4, 8]); ctx.lineDashOffset = -(now * 18) % 12; ctx.stroke(); ctx.setLineDash([]);
  } else { ctx.strokeStyle = '#5fae6e'; ctx.stroke(); }
  arms(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();  // top sheen

  // central hub + bolt
  ctx.beginPath(); ctx.arc(cx, cy, W / 2 + 2, 0, Math.PI * 2);
  ctx.fillStyle = '#3f8a4e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#26512f'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, (W - 8) / 2), 0, Math.PI * 2);
  ctx.fillStyle = oil ? '#3b2b46' : '#5fae6e'; ctx.fill();
  ctx.restore();
};

// Belt bridge: two perpendicular belt lanes on one tile. The vertical lane is
// drawn as an overpass (with a shadow) over the horizontal one, so the two flows
// visibly cross without mixing. Items on each lane ride independently.
FAB.Game.prototype.drawCross = function (ctx, e, sx, sy) {
  this.drawCrossLane(ctx, e, sx, sy, true);    // horizontal lane (underneath)
  this.drawCrossLane(ctx, e, sx, sy, false);   // vertical lane (the overpass)
};
FAB.Game.prototype.drawCrossLane = function (ctx, e, sx, sy, horiz) {
  var T = FAB.TILE, cx = sx + T / 2, cy = sy + T / 2, half = Math.round(T * 0.32);
  var dirIdx = horiz ? (e.dirH || 1) : (e.dirV || 2), d = FAB.DIR[dirIdx];
  var items = horiz ? (e.itemsH || []) : (e.itemsV || []);
  var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  ctx.save();
  if (!horiz) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(cx - half - 2, sy + 1, (half + 2) * 2, T - 2); } // overpass shadow
  var x0 = horiz ? sx : cx - half, y0 = horiz ? cy - half : sy, w = horiz ? T : half * 2, h = horiz ? half * 2 : T;
  ctx.fillStyle = '#23262d'; ctx.fillRect(x0, y0, w, h);              // frame
  ctx.fillStyle = '#34373e'; ctx.fillRect(x0 + 2, y0 + 2, w - 4, h - 4); // belt surface
  // animated treads along the lane direction
  ctx.strokeStyle = '#646b78'; ctx.lineWidth = 3;
  for (var k = 0; k < 4; k++) {
    var p = ((k / 4) + now * 1.35) % 1, px = cx + d.x * (p - 0.5) * T, py = cy + d.y * (p - 0.5) * T;
    ctx.beginPath();
    if (horiz) { ctx.moveTo(px, cy - half + 2); ctx.lineTo(px, cy + half - 2); }
    else { ctx.moveTo(cx - half + 2, py); ctx.lineTo(cx + half - 2, py); }
    ctx.stroke();
  }
  // items
  for (var i = 0; i < items.length; i++) {
    var it = items[i], item = FAB.ITEMS[it.item];
    var ix = cx + d.x * (it.pos - 0.5) * T, iy = cy + d.y * (it.pos - 0.5) * T;
    if (!FAB.Assets.draw(ctx, 'item_' + it.item, ix - 9, iy - 9, 18, 18, 0))
      FAB.Placeholder.token(ctx, ix, iy, 8, item.color, item.icon);
  }
  ctx.restore();
};

// road tile: asphalt with yellow dashed markings toward each connected neighbour
FAB.Game.prototype.drawRoad = function (ctx, e, sx, sy) {
  var T = FAB.TILE, f = this.factory, cx = sx + T / 2, cy = sy + T / 2;
  ctx.fillStyle = '#3c3f46'; ctx.fillRect(sx, sy, T, T);
  ctx.fillStyle = '#34373d'; ctx.fillRect(sx + 1, sy + 1, T - 2, T - 2);
  ctx.strokeStyle = '#e8c23a'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
  var any = false;
  for (var d = 0; d < 4; d++) {
    var n = f.at(e.x + FAB.DIR[d].x, e.y + FAB.DIR[d].y);
    if (n && (n.kind === 'road' || n.kind === 'parking' || n.type === 'car_factory')) {
      any = true; var dd = FAB.DIR[d];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dd.x * T * 0.5, cy + dd.y * T * 0.5); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  if (!any) { ctx.fillStyle = '#e8c23a'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 6.283); ctx.fill(); }
};

// 4x4 parking lot: asphalt with four marked spaces and a P sign
FAB.Game.prototype.drawParking = function (ctx, e, sx, sy, sz) {
  var T = FAB.TILE;
  ctx.fillStyle = '#33363d'; FAB.roundRect(ctx, sx + 1, sy + 1, sz - 2, sz - 2, 6); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#5a6068'; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
  for (var idx = 0; idx < 4; idx++) {
    var col = idx % 2, row = (idx / 2) | 0;
    ctx.strokeRect(sx + col * 2 * T + T * 0.35, sy + row * 2 * T + T * 0.35, T * 1.3, T * 1.3);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('🅿️', sx + 4, sy + 3);
};

// 4x4 car factory: the generated building (rotated to face e.dir) with an animated
// garage door overlaid on the facing edge. Falls back to a procedural building.
FAB.Game.prototype.drawCarFactory = function (ctx, e, sx, sy, sz) {
  var T = FAB.TILE;
  var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var open = 0;
  if (e.doorT != null) { var t = (now - e.doorT) / 1000; if (t >= 0 && t < 2) open = t < 0.5 ? t / 0.5 : (t < 1.5 ? 1 : 1 - (t - 1.5) / 0.5); }
  var depth = T * 1.15, len = 2 * T;

  if (FAB.Assets.has('machine_car_factory')) {
    // draw the building rotated so its (bottom-edge) door faces e.dir, then overlay
    // the animated door at that same bottom edge in the rotated frame
    ctx.save();
    ctx.translate(sx + sz / 2, sy + sz / 2);
    ctx.rotate((e.dir - 2) * Math.PI / 2);
    FAB.Assets.draw(ctx, 'machine_car_factory', -sz / 2, -sz / 2, sz, sz, 0);
    var dxl = -T, dyl = sz / 2 - depth;
    ctx.fillStyle = '#15161a'; ctx.fillRect(dxl, dyl, len, depth);                  // interior
    ctx.fillStyle = '#cf5aa6'; ctx.fillRect(dxl, dyl, len, depth * (1 - open));     // slab retracts up
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(dxl, dyl, len, depth);
    ctx.restore();
  } else {
    // procedural pink building with a door on the facing edge
    ctx.fillStyle = '#b02a7a'; FAB.roundRect(ctx, sx + 2, sy + 2, sz - 4, sz - 4, 8); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; FAB.roundRect(ctx, sx + 7, sy + 7, sz - 14, T * 0.7, 4); ctx.fill();
    ctx.font = Math.floor(T * 0.7) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏭', sx + sz / 2, sy + T * 0.55);
    var dx, dy, dw, dh;
    if (e.dir === 2) { dx = sx + T; dy = sy + sz - depth; dw = len; dh = depth; }
    else if (e.dir === 0) { dx = sx + T; dy = sy; dw = len; dh = depth; }
    else if (e.dir === 1) { dx = sx + sz - depth; dy = sy + T; dw = depth; dh = len; }
    else { dx = sx; dy = sy + T; dw = depth; dh = len; }
    ctx.fillStyle = '#15161a'; ctx.fillRect(dx, dy, dw, dh);
    var cov = 1 - open;
    ctx.fillStyle = '#cf5aa6';
    if (e.dir === 2) ctx.fillRect(dx, dy, dw, dh * cov);
    else if (e.dir === 0) ctx.fillRect(dx, dy + dh * open, dw, dh * cov);
    else if (e.dir === 1) ctx.fillRect(dx, dy, dw * cov, dh);
    else ctx.fillRect(dx + dw * open, dy, dw * cov, dh);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(dx, dy, dw, dh);
  }

  // colour chip: shows what colour this factory is set to build
  var hex = '#e74c3c';
  for (var i = 0; i < FAB.CAR_COLORS.length; i++) if (FAB.CAR_COLORS[i].id === e.carColor) hex = FAB.CAR_COLORS[i].hex;
  FAB.roundRect(ctx, sx + 4, sy + sz - 22, 36, 18, 5); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
  ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(sx + 13, sy + sz - 13, 6, 0, 6.283); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  ctx.font = '12px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('🚗', sx + 22, sy + sz - 13);

  if (e.progress > 0 && e.startTime) {
    var pr = 1 - e.progress / e.startTime;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx + 4, sy + 4, sz - 8, 4);
    ctx.fillStyle = '#7be37b'; ctx.fillRect(sx + 4, sy + 4, (sz - 8) * pr, 4);
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
  var sv = this.factory.structVer || 0;
  if (e._shape && e._sv === sv) return e._shape;     // only recompute when the layout changes
  var D = e.dir, back = (D + 2) & 3, left = (D + 3) & 3, right = (D + 1) & 3, f = this.factory;
  function feeds(k, want) {
    var n = f.at(e.x + FAB.DIR[k].x, e.y + FAB.DIR[k].y);
    return n && n.kind === 'belt' && n.dir === want;
  }
  var straight = feeds(back, D);
  var leftFeed = feeds(left, right);   // belt on our left pointing across into us
  var rightFeed = feeds(right, left);  // belt on our right pointing across into us
  var s;
  if (straight || (leftFeed && rightFeed) || (!leftFeed && !rightFeed)) s = { type: 'straight', from: back };
  else s = { type: 'corner', from: leftFeed ? left : right };
  e._shape = s; e._sv = sv;
  return s;
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
  var T = FAB.TILE, sx = Math.round(e.x * T - this.cam.x), sy = Math.round(e.y * T - this.cam.y);
  var shape = this.beltShape(e);
  var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  var frame = (((now * 1.35) % 1) * FAB.BELT_FRAMES) | 0;  // tread phase
  ctx.drawImage(this.beltSprite(shape.type, e.dir, shape.from, frame), sx, sy);
};

// A small data-URL thumbnail for machines that are drawn procedurally (so the
// build bar shows what they actually look like instead of a generic emoji).
FAB.Game.prototype.machineThumb = function (type) {
  this._thumbs = this._thumbs || {};
  if (type in this._thumbs) return this._thumbs[type];
  if (typeof document === 'undefined') { this._thumbs[type] = null; return null; }
  var T = FAB.TILE, S = 2, url = null;
  var c = document.createElement('canvas'); c.width = T * S; c.height = T * S;
  var x = c.getContext('2d'); x.scale(S, S);
  try {
    if (type === 'belt') { x.drawImage(this.beltSprite('straight', 1, 3, 0), 0, 0); }
    else if (type === 'road') {
      x.fillStyle = '#3c3f46'; x.fillRect(0, 0, T, T); x.fillStyle = '#34373d'; x.fillRect(1, 1, T - 2, T - 2);
      x.strokeStyle = '#e8c23a'; x.lineWidth = 2; x.setLineDash([4, 4]);
      x.beginPath(); x.moveTo(0, T / 2); x.lineTo(T, T / 2); x.stroke(); x.setLineDash([]);
    } else if (type === 'pipe') {
      var cy = T / 2, W = 13;
      function ln(w, col) { x.lineWidth = w; x.strokeStyle = col; x.lineCap = 'butt'; x.beginPath(); x.moveTo(0, cy); x.lineTo(T, cy); x.stroke(); }
      ln(W + 5, 'rgba(0,0,0,0.18)'); ln(W + 2, '#26512f'); ln(W, '#3f8a4e'); ln(W - 6, '#5fae6e'); ln(2, 'rgba(255,255,255,0.18)');
      x.beginPath(); x.arc(T / 2, cy, W / 2 + 2, 0, 6.283); x.fillStyle = '#3f8a4e'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#26512f'; x.stroke();
    } else if (type === 'grabber') { this.drawArm(x, { x: 0, y: 0, dir: 1, cooldown: 0, carryItem: null }, 0, 0); }
    else if (type === 'crossing') { this.drawCross(x, { x: 0, y: 0, dir: 1, dirH: 1, dirV: 2, itemsH: [], itemsV: [] }, 0, 0); }
    else { this._thumbs[type] = null; return null; }
    url = c.toDataURL();
  } catch (e) { url = null; }
  this._thumbs[type] = url; return url;
};

// Cached, baked belt body+treads (one image per shape per tread phase) so the
// render loop blits a single image instead of re-stroking ~14 paths per belt.
FAB.Game.prototype.beltSprite = function (type, dir, from, frame) {
  this._beltCache = this._beltCache || {};
  var key = type + dir + (from == null ? '' : 'f' + from) + 'p' + frame;
  var c = this._beltCache[key];
  if (c) return c;
  var T = FAB.TILE;
  c = document.createElement('canvas'); c.width = T; c.height = T;
  var ctx = c.getContext('2d');
  var pointAt = this.beltPath({ dir: dir }, { type: type, from: from }, 0, 0); // local coords
  var SAMP = type === 'corner' ? 12 : 1, pts = [], i;
  for (i = 0; i <= SAMP; i++) pts.push(pointAt(i / SAMP));
  function strokePath(w, color) {
    ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
  }
  strokePath(T * 0.92, 'rgba(0,0,0,0.16)');
  strokePath(T * 0.90, '#22252b');
  strokePath(T * 0.82, '#5a626e');
  strokePath(T * 0.78, '#3a3f48');
  strokePath(T * 0.60, '#2f333b');
  var off = frame / FAB.BELT_FRAMES;
  for (var k = 0; k < 4; k++) {
    var p = ((k / 4) + off) % 1;
    var a = pointAt(Math.min(1, p + 0.03)), b = pointAt(Math.max(0, p - 0.03));
    var ang = Math.atan2(a.y - b.y, a.x - b.x);
    var pt = pointAt(p), nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    ctx.strokeStyle = '#646b78'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pt.x - nx * T * 0.29, pt.y - ny * T * 0.29); ctx.lineTo(pt.x + nx * T * 0.29, pt.y + ny * T * 0.29); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pt.x - nx * T * 0.29 + Math.cos(ang) * 2, pt.y - ny * T * 0.29 + Math.sin(ang) * 2);
    ctx.lineTo(pt.x + nx * T * 0.29 + Math.cos(ang) * 2, pt.y + ny * T * 0.29 + Math.sin(ang) * 2); ctx.stroke();
  }
  strokePath(2, 'rgba(255,255,255,0.06)');
  this._beltCache[key] = c;
  return c;
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
  // Draw a vector car tinted to the chosen colour. (The generated car sprites are
  // a fixed red, so using them would make every car red regardless of selection.)
  var hex = c.colorHex();
  ctx.fillStyle = '#222'; ctx.fillRect(-16, -18, 4, 10); ctx.fillRect(12, -18, 4, 10); ctx.fillRect(-16, 8, 4, 10); ctx.fillRect(12, 8, 4, 10); // wheels
  ctx.fillStyle = hex; FAB.roundRect(ctx, -14, -24, 28, 48, 8); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; FAB.roundRect(ctx, -11, -4, 22, 16, 4); ctx.fill(); // roof shade
  ctx.fillStyle = 'rgba(190,235,255,0.9)'; FAB.roundRect(ctx, -10, -16, 20, 11, 4); ctx.fill(); // windshield
  ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(-9, -23, 1.8, 0, Math.PI * 2); ctx.arc(9, -23, 1.8, 0, Math.PI * 2); ctx.fill(); // headlights
  if (c.hasSpoiler) { ctx.fillStyle = '#111'; ctx.fillRect(-14, 22, 28, 5); }
  if (c.hasGrappler) { ctx.fillStyle = '#d23b3b'; ctx.beginPath(); ctx.arc(0, -26, 5, 0, Math.PI * 2); ctx.fill(); }
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

// ---------------------------------------------------------------- minimap
FAB.Game.prototype._isDark = function (hex) {
  var c = FAB.hex2rgb(hex); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) < 110;
};
// bake biomes + resource deposits once (static), at a crisp resolution
FAB.Game.prototype.bakeMinimap = function () {
  var w = this.world, s = this._mmBakeScale, mw = Math.round(w.w * s), mh = Math.round(w.h * s);
  var c = document.createElement('canvas'); c.width = mw; c.height = mh; var x = c.getContext('2d');
  for (var ty = 0; ty < w.h; ty++) for (var tx = 0; tx < w.w; tx++) {
    x.fillStyle = FAB.BIOMES[w.biomeAt(tx, ty)].ground;
    x.fillRect(Math.floor(tx * s), Math.floor(ty * s), Math.ceil(s) + 1, Math.ceil(s) + 1);
  }
  for (var k in w.nodes) {
    var n = w.nodes[k], p = k.split(',').map(Number), col = this._mmRes[n.res] || '#fff';
    var mx = (p[0] + 0.5) * s, my = (p[1] + 0.5) * s;
    x.fillStyle = this._isDark(col) ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
    x.beginPath(); x.arc(mx, my, s * 0.9, 0, 6.283); x.fill();
    x.fillStyle = col; x.beginPath(); x.arc(mx, my, s * 0.6, 0, 6.283); x.fill();
  }
  this._mmBase = c; this._mmW = mw; this._mmH = mh;
};
// big centered map modal (resource finder)
FAB.Game.prototype.drawBigMap = function (ctx) {
  if (typeof document === 'undefined') return;
  if (!this._mmBase) this.bakeMinimap();
  var w = this.world, cw = ctx.canvas.width, ch = ctx.canvas.height, self = this;
  var pad = 14, titleH = 28, legendH = 30;
  var disp = Math.min((cw - 90) / w.w, (ch - 100 - titleH - legendH) / w.h);
  var mapW = Math.round(w.w * disp), mapH = Math.round(w.h * disp);
  var panelW = mapW + pad * 2, panelH = mapH + pad * 2 + titleH + legendH;
  var panelX = Math.round((cw - panelW) / 2), panelY = Math.round((ch - panelH) / 2);
  var mapX = panelX + pad, mapY = panelY + pad + titleH;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, cw, ch);            // dim backdrop
  FAB.roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fillStyle = 'rgba(14,28,44,0.97)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#3a5d85'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('🗺️ Map', panelX + pad, panelY + 7);
  ctx.fillStyle = '#9fb6cf'; ctx.font = '13px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('press M or Esc to close', panelX + panelW - pad, panelY + 10);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(this._mmBase, mapX, mapY, mapW, mapH);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(mapX, mapY, mapW, mapH);

  // machines, cars, and you
  this.factory.eachEntity(function (e) { ctx.fillStyle = 'rgba(180,210,240,0.9)'; ctx.fillRect(mapX + e.x * disp - 1, mapY + e.y * disp - 1, 2, 2); });
  this.cars.forEach(function (c) { ctx.fillStyle = '#fff'; ctx.fillRect(mapX + (c.x / FAB.TILE) * disp - 1.5, mapY + (c.y / FAB.TILE) * disp - 1.5, 3, 3); });
  var foc = this.driving || this.player, fx = mapX + (foc.x / FAB.TILE) * disp, fy = mapY + (foc.y / FAB.TILE) * disp;
  var pulse = 4 + Math.sin(Date.now() / 250) * 1.2;
  ctx.beginPath(); ctx.arc(fx, fy, pulse, 0, 6.283); ctx.fillStyle = '#ffe27a'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.fillStyle = '#ffe27a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('you', fx + 8, fy);

  // legend: 6 resources across one row
  var names = { iron_ore: 'Iron', copper_ore: 'Copper', coal: 'Coal', stone: 'Stone', wood: 'Logs', crude_oil: 'Oil' };
  var res = ['iron_ore', 'copper_ore', 'coal', 'stone', 'wood', 'crude_oil'], gap = mapW / 6;
  var ly = mapY + mapH + pad + 4;
  ctx.font = '13px sans-serif'; ctx.textBaseline = 'middle';
  res.forEach(function (r, i) {
    var cxp = mapX + i * gap;
    ctx.fillStyle = self._mmRes[r]; ctx.beginPath(); ctx.arc(cxp + 6, ly, 4, 0, 6.283); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
    ctx.fillStyle = '#cfe0f2'; ctx.textAlign = 'left'; ctx.fillText(names[r], cxp + 15, ly);
  });
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
