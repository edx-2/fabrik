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

  // terrain
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    if (!this.world.inBounds(x, y)) { ctx.fillStyle = '#23364a'; ctx.fillRect(x * T - cam.x, y * T - cam.y, T, T); continue; }
    var bid = this.world.biomeAt(x, y), b = FAB.BIOMES[bid];
    if (!FAB.Assets.draw(ctx, 'tile_' + bid, x * T - cam.x, y * T - cam.y, T, T, 0)) {
      ctx.fillStyle = b.ground; ctx.fillRect(x * T - cam.x, y * T - cam.y, T, T);
      if (((x * 7 + y * 13) & 7) === 0) { ctx.fillStyle = b.accent; ctx.fillRect(x * T - cam.x + 6, y * T - cam.y + 6, 6, 6); }
    }
    var node = this.world.nodeAt(x, y);
    if (node) this.drawNode(ctx, node, x * T - cam.x, y * T - cam.y);
    else { var dec = this.world.decor[FAB.key(x, y)]; if (dec) { ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dec, x * T - cam.x + T / 2, y * T - cam.y + T / 2); } }
  }

  // factory entities
  var self = this;
  this.factory.eachEntity(function (e) {
    if (e.x + e.size < x0 || e.x > x1 || e.y + e.size < y0 || e.y > y1) return;
    self.drawEntity(ctx, e);
  });

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

FAB.Game.prototype.drawNode = function (ctx, node, sx, sy) {
  var T = FAB.TILE, it = FAB.ITEMS[node.res];
  ctx.fillStyle = it.color; FAB.roundRect(ctx, sx + 3, sy + 3, T - 6, T - 6, 6); ctx.fill();
  ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(it.icon, sx + T / 2, sy + T / 2 + 1);
};

FAB.Game.prototype.drawEntity = function (ctx, e) {
  var T = FAB.TILE, cam = this.cam, sx = e.x * T - cam.x, sy = e.y * T - cam.y, sz = e.size * T;
  var def = FAB.MACHINES[e.type];
  if (e.kind === 'belt') { this.drawBelt(ctx, e, sx, sy); return; }
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

FAB.Game.prototype.drawBelt = function (ctx, e, sx, sy) {
  var T = FAB.TILE, d = FAB.DIR[e.dir];
  ctx.fillStyle = '#3a3d44'; ctx.fillRect(sx + 2, sy + 2, T - 4, T - 4);
  // animated chevrons
  ctx.strokeStyle = '#6f7782'; ctx.lineWidth = 3;
  var cx = sx + T / 2, cy = sy + T / 2;
  ctx.beginPath();
  ctx.moveTo(cx - d.y * 6 - d.x * 8, cy + d.x * 6 - d.y * 8);
  ctx.lineTo(cx + d.x * 8, cy + d.y * 8);
  ctx.lineTo(cx + d.y * 6 - d.x * 8, cy - d.x * 6 - d.y * 8);
  ctx.stroke();
  // items
  for (var i = 0; i < e.items.length; i++) {
    var it = e.items[i], item = FAB.ITEMS[it.item];
    var px = sx + T / 2 + d.x * (it.pos - 0.5) * T;
    var py = sy + T / 2 + d.y * (it.pos - 0.5) * T;
    if (!FAB.Assets.draw(ctx, 'item_' + it.item, px - 9, py - 9, 18, 18, 0))
      FAB.Placeholder.token(ctx, px, py, 8, item.color, item.icon);
  }
};

FAB.Game.prototype.drawArm = function (ctx, e, sx, sy) {
  var T = FAB.TILE, cx = sx + T / 2, cy = sy + T / 2, f = FAB.DIR[e.dir], b = FAB.DIR[FAB.opposite(e.dir)];
  ctx.fillStyle = '#caa23c'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e6c45a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx + b.x * 10, cy + b.y * 10); ctx.lineTo(cx + f.x * 12, cy + f.y * 12); ctx.stroke();
  ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(cx + f.x * 12, cy + f.y * 12, 4, 0, Math.PI * 2); ctx.fill();
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
