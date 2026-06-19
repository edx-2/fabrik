/* Fabrik — factory simulation.
 * Owns every placed machine/belt/pipe and steps the whole factory each tick.
 * Resource nodes are treated as infinite (kid-friendly: patches never run dry). */
var FAB = window.FAB || (window.FAB = {});

var BELT_SPEED = 0.17;   // fraction of a tile per tick
var BELT_GAP = 0.34;     // min spacing between items on a belt
var OUT_CAP = 24;        // max items buffered in a machine output
var PIPE_CAP = 60;       // oil capacity per connected pipe group

FAB.Factory = function () {
  this.ents = {};        // "x,y" -> entity (top-left tile for multi-tile)
  this.owner = {};       // "x,y" -> key of the entity occupying this tile
  this.pipeDirty = true;
  this.groups = [];      // [{ cells:[keys], oil, cap }]
  this.cellGroup = {};   // pipe cell key -> group index
};

FAB.Factory.prototype.keyOwner = function (x, y) { return this.owner[FAB.key(x, y)]; };
FAB.Factory.prototype.at = function (x, y) {
  var k = this.owner[FAB.key(x, y)];
  return k ? this.ents[k] : null;
};
FAB.Factory.prototype.footprint = function (type) {
  var sz = (FAB.MACHINES[type] && FAB.MACHINES[type].size) || 1; return sz;
};

FAB.Factory.prototype.canPlace = function (type, x, y, world) {
  var sz = this.footprint(type);
  var def = FAB.MACHINES[type];
  for (var oy = 0; oy < sz; oy++) for (var ox = 0; ox < sz; ox++) {
    var nx = x + ox, ny = y + oy;
    if (!world.inBounds(nx, ny)) return false;
    if (this.owner[FAB.key(nx, ny)]) return false;
    if (world.isWater(nx, ny) && def.kind !== 'pump') return false;
  }
  // miners must sit on a matching solid node; pumps on oil
  if (def.kind === 'miner') { var n = world.nodeAt(x, y); if (!n || n.res === 'crude_oil') return false; }
  if (def.kind === 'pump') { var n2 = world.nodeAt(x, y); if (!n2 || n2.res !== 'crude_oil') return false; }
  return true;
};

FAB.Factory.prototype.place = function (type, x, y, dir, world) {
  var def = FAB.MACHINES[type];
  var e = {
    type: type, kind: def.kind, x: x, y: y, dir: dir || 0,
    size: this.footprint(type), recipe: null, progress: 0,
    inBuf: {}, outBuf: {}, store: {}, items: [], cooldown: 0,
    carColor: 'red', carKind: 'basic', node: null, anim: 0
  };
  if (def.kind === 'miner') { var n = world.nodeAt(x, y); e.recipe = null; e.res = n.res; }
  if (def.kind === 'crusher') e.recipe = 'sand';
  if (def.kind === 'sawmill') e.recipe = 'plank';
  if (type === 'refinery') e.recipe = 'rubber';
  var k = FAB.key(x, y);
  this.ents[k] = e;
  for (var oy = 0; oy < e.size; oy++) for (var ox = 0; ox < e.size; ox++)
    this.owner[FAB.key(x + ox, y + oy)] = k;
  if (def.kind === 'pipe' || def.kind === 'pump' || def.kind === 'refinery') this.pipeDirty = true;
  return e;
};

FAB.Factory.prototype.remove = function (x, y) {
  var k = this.owner[FAB.key(x, y)];
  if (!k) return null;
  var e = this.ents[k];
  var refunds = {};
  function add(o) { for (var it in o) refunds[it] = (refunds[it] || 0) + o[it]; }
  add(e.inBuf); add(e.outBuf); add(e.store);
  if (e.items) e.items.forEach(function (t) { if (t.item !== 'crude_oil') refunds[t.item] = (refunds[t.item] || 0) + 1; });
  for (var oy = 0; oy < e.size; oy++) for (var ox = 0; ox < e.size; ox++)
    delete this.owner[FAB.key(e.x + ox, e.y + oy)];
  delete this.ents[k];
  if (e.kind === 'pipe' || e.kind === 'pump' || e.kind === 'refinery') this.pipeDirty = true;
  refunds[e.type] = (refunds[e.type] || 0) + 1; // the machine itself
  return refunds;
};

// ---- acceptance / transfer helpers ----------------------------------------
FAB.Factory.prototype.acceptsInput = function (e, item) {
  if (e.kind === 'box') return true;
  if (e.kind === 'crafter') {
    var r = e.recipe && FAB.RECIPES[e.recipe];
    if (!r) return false;
    for (var i = 0; i < r.inputs.length; i++) {
      var need = r.inputs[i];
      if (need[0] === item) return (e.inBuf[item] || 0) < need[1] * 3;
    }
  }
  return false;
};
FAB.Factory.prototype.insert = function (e, item) {
  if (!this.acceptsInput(e, item)) return false;
  if (e.kind === 'box') e.store[item] = (e.store[item] || 0) + 1;
  else e.inBuf[item] = (e.inBuf[item] || 0) + 1;
  return true;
};
// take one output item from a machine/box, return its item id (or null)
FAB.Factory.prototype.takeOutput = function (e) {
  var src = e.kind === 'box' ? e.store : e.outBuf;
  for (var it in src) { if (src[it] > 0) { src[it]--; if (src[it] === 0) delete src[it]; return it; } }
  return null;
};

// ---- belt helpers ----------------------------------------------------------
FAB.Factory.prototype.beltHasRoomAtStart = function (belt) {
  for (var i = 0; i < belt.items.length; i++) if (belt.items[i].pos < BELT_GAP) return false;
  return true;
};
FAB.Factory.prototype.dropOnBelt = function (belt, item) {
  if (!this.beltHasRoomAtStart(belt)) return false;
  belt.items.push({ item: item, pos: 0 });
  return true;
};

// ---- pipe network ----------------------------------------------------------
FAB.Factory.prototype.rebuildPipes = function () {
  this.groups = []; this.cellGroup = {};
  var self = this, seen = {};
  Object.keys(this.ents).forEach(function (k) {
    var e = self.ents[k];
    if (e.kind !== 'pipe' || seen[k]) return;
    var group = { cells: [], oil: 0, cap: 0 }, gi = self.groups.length, stack = [k];
    while (stack.length) {
      var ck = stack.pop(); if (seen[ck]) continue; seen[ck] = true;
      var ce = self.ents[ck]; if (!ce || ce.kind !== 'pipe') continue;
      group.cells.push(ck); self.cellGroup[ck] = gi; group.cap += PIPE_CAP;
      for (var d = 0; d < 4; d++) {
        var nk = FAB.key(ce.x + FAB.DIR[d].x, ce.y + FAB.DIR[d].y);
        var ne = self.ents[nk];
        if (ne && ne.kind === 'pipe' && !seen[nk]) stack.push(nk);
      }
    }
    self.groups.push(group);
  });
  this.pipeDirty = false;
};
// group adjacent to a tile-occupying entity (pump/refinery), via any covered tile
FAB.Factory.prototype.adjacentPipeGroup = function (e) {
  for (var oy = 0; oy < e.size; oy++) for (var ox = 0; ox < e.size; ox++) {
    for (var d = 0; d < 4; d++) {
      var nk = FAB.key(e.x + ox + FAB.DIR[d].x, e.y + oy + FAB.DIR[d].y);
      var gi = this.cellGroup[nk];
      if (gi !== undefined) return this.groups[gi];
    }
  }
  return null;
};

// ---- main tick -------------------------------------------------------------
FAB.Factory.prototype.tick = function (game) {
  if (this.pipeDirty) this.rebuildPipes();
  var self = this, world = game.world;
  var list = Object.keys(this.ents).map(function (k) { return self.ents[k]; });

  // 1) pumps add oil
  list.forEach(function (e) {
    if (e.kind !== 'pump') return;
    var g = self.adjacentPipeGroup(e);
    if (g && g.oil < g.cap) g.oil = Math.min(g.cap, g.oil + 2);
    e.anim++;
  });

  // 2) belts advance items (front-most first)
  list.forEach(function (e) {
    if (e.kind !== 'belt') return;
    e.items.sort(function (a, b) { return b.pos - a.pos; });
    var dir = FAB.DIR[e.dir];
    for (var i = 0; i < e.items.length; i++) {
      var it = e.items[i];
      var ahead = (i === 0) ? 1.0 : e.items[i - 1].pos - BELT_GAP;
      var target = Math.min(1.0, it.pos + BELT_SPEED);
      if (target > ahead) target = ahead;
      it.pos = target;
      if (it.pos >= 0.999 && i === 0) {
        // try to hand off to the next tile
        var nx = e.x + dir.x, ny = e.y + dir.y, ne = self.at(nx, ny);
        if (ne && ne.kind === 'belt') { if (self.dropOnBelt(ne, it.item)) { e.items.shift(); i--; } }
        else if (ne && (ne.kind === 'crafter' || ne.kind === 'box')) { if (self.insert(ne, it.item)) { e.items.shift(); i--; } }
      }
    }
  });

  // 3) miners produce onto belt/machine in front
  list.forEach(function (e) {
    if (e.kind !== 'miner') return;
    e.progress++; e.anim++;
    if (e.progress < 16) return;
    var dir = FAB.DIR[e.dir];
    var ne = self.at(e.x + dir.x, e.y + dir.y);
    var ok = false;
    if (ne && ne.kind === 'belt') ok = self.dropOnBelt(ne, e.res);
    else if (ne && (ne.kind === 'crafter' || ne.kind === 'box')) ok = self.insert(ne, e.res);
    if (ok) { e.progress = 0; game.onProduced(e.res, 1); }
  });

  // 4) grabber arms move one item from behind -> front
  list.forEach(function (e) {
    if (e.kind !== 'arm') return;
    e.anim++;
    if (e.cooldown > 0) { e.cooldown--; return; }
    var f = FAB.DIR[e.dir], b = FAB.DIR[FAB.opposite(e.dir)];
    var src = self.at(e.x + b.x, e.y + b.y);
    var dst = self.at(e.x + f.x, e.y + f.y);
    if (!src || !dst) return;
    // peek an item the destination will accept, then commit
    var item = null;
    if (src.kind === 'belt') { if (src.items.length) item = src.items[0].item; }
    else if (src.kind === 'box') { for (var s in src.store) { item = s; break; } }
    else if (src.kind === 'crafter' || src.kind === 'refinery') { for (var o in src.outBuf) { item = o; break; } }
    if (!item) return;
    var willTake = (dst.kind === 'box') || self.acceptsInput(dst, item) || (dst.kind === 'belt' && self.beltHasRoomAtStart(dst));
    if (!willTake) return;
    // grab from source
    if (src.kind === 'belt') { src.items.sort(function (a, b) { return a.pos - b.pos; }); src.items.shift(); }
    else if (src.kind === 'box') { src.store[item]--; if (!src.store[item]) delete src.store[item]; }
    else { src.outBuf[item]--; if (!src.outBuf[item]) delete src.outBuf[item]; }
    // give to destination
    if (dst.kind === 'belt') self.dropOnBelt(dst, item); else self.insert(dst, item);
    e.cooldown = 4;
  });

  // 5) crafters & refineries
  list.forEach(function (e) {
    if (e.kind !== 'crafter' && e.kind !== 'refinery') return;
    var r = e.recipe && FAB.RECIPES[e.recipe];
    if (!r) return;
    if (e.progress > 0) {
      e.progress--; e.anim++;
      if (e.progress === 0) self.finishCraft(e, r, game);
      return;
    }
    // can we start?
    var outItem = r.out && typeof r.out === 'string' ? r.out : e.recipe;
    if ((e.outBuf[outItem] || 0) >= OUT_CAP) return;
    var grp = null;
    for (var i = 0; i < r.inputs.length; i++) {
      var item = r.inputs[i][0], qty = r.inputs[i][1];
      if (FAB.ITEMS[item] && FAB.ITEMS[item].liquid) {
        grp = grp || self.adjacentPipeGroup(e);
        if (!grp || grp.oil < qty) return;
      } else if ((e.inBuf[item] || 0) < qty) return;
    }
    // consume
    for (var j = 0; j < r.inputs.length; j++) {
      var it2 = r.inputs[j][0], q2 = r.inputs[j][1];
      if (FAB.ITEMS[it2] && FAB.ITEMS[it2].liquid) grp.oil -= q2;
      else { e.inBuf[it2] -= q2; if (e.inBuf[it2] <= 0) delete e.inBuf[it2]; }
    }
    e.progress = r.time; e.startTime = r.time;
  });
};

FAB.Factory.prototype.finishCraft = function (e, r, game) {
  var outItem = (r.out && typeof r.out === 'string') ? r.out : e.recipe;
  var qty = r.out && typeof r.out === 'number' ? r.out : (r.outQty || 1);
  if (outItem === 'car') {
    game.spawnCar(e);             // car factory: deliver a drivable car
    game.onProduced('car', 1, { color: e.carColor, kind: e.carKind, recipe: e.recipe });
    return;
  }
  e.outBuf[outItem] = (e.outBuf[outItem] || 0) + qty;
  game.onProduced(outItem, qty);
};

// nearest parking-lot entity to a position (for car delivery)
FAB.Factory.prototype.nearestParking = function (x, y) {
  var best = null, bd = 1e9, self = this;
  Object.keys(this.ents).forEach(function (k) {
    var e = self.ents[k];
    if (e.kind !== 'parking') return;
    var d = FAB.dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  });
  return best;
};

FAB.Factory.prototype.eachEntity = function (cb) {
  for (var k in this.ents) cb(this.ents[k]);
};
