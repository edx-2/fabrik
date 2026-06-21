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
    carColor: 'red', carKind: 'basic', node: null, anim: 0,
    itemsH: [], itemsV: [], dirH: 1, dirV: 2   // belt-bridge lanes (cross)
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
  function refundItems(list) { if (list) list.forEach(function (t) { if (t.item !== 'crude_oil') refunds[t.item] = (refunds[t.item] || 0) + 1; }); }
  refundItems(e.items); refundItems(e.itemsH); refundItems(e.itemsV);
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

// ---- belt-bridge (crossing) helpers ---------------------------------------
// A crossing has two lanes: horizontal (dirH = east/west) and vertical
// (dirV = south/north). Each lane auto-orients to the belt feeding it.
FAB.Factory.prototype.crossLaneDir = function (e, horiz) {
  if (horiz) {
    var wl = this.at(e.x - 1, e.y), er = this.at(e.x + 1, e.y);
    if (wl && wl.kind === 'belt' && wl.dir === 1) return 1; // belt to the west flowing east
    if (er && er.kind === 'belt' && er.dir === 3) return 3; // belt to the east flowing west
    return e.dirH || 1;
  }
  var up = this.at(e.x, e.y - 1), dn = this.at(e.x, e.y + 1);
  if (up && up.kind === 'belt' && up.dir === 2) return 2;   // belt above flowing south
  if (dn && dn.kind === 'belt' && dn.dir === 0) return 0;   // belt below flowing north
  return e.dirV || 2;
};
FAB.Factory.prototype.dropOnCross = function (cross, dirIdx, item) {
  var horiz = (dirIdx === 1 || dirIdx === 3);
  var laneDir = horiz ? cross.dirH : cross.dirV;
  if (laneDir !== dirIdx) return false;                     // only accept items going the lane's way
  var lane = horiz ? cross.itemsH : cross.itemsV;
  for (var i = 0; i < lane.length; i++) if (lane[i].pos < BELT_GAP) return false;
  lane.push({ item: item, pos: 0 });
  return true;
};

// Advance one lane of items along dirIdx and hand the front one off at the end.
// Shared by normal belts and both lanes of a crossing.
FAB.Factory.prototype.advanceLane = function (items, x, y, dirIdx, game) {
  items.sort(function (a, b) { return b.pos - a.pos; });
  var dir = FAB.DIR[dirIdx];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var ahead = (i === 0) ? 1.0 : items[i - 1].pos - BELT_GAP;
    var target = Math.min(1.0, it.pos + BELT_SPEED);
    if (target > ahead) target = ahead;
    it.pos = target;
    if (it.pos >= 0.999 && i === 0) {
      var ne = this.at(x + dir.x, y + dir.y);
      if (ne && ne.kind === 'belt') { if (this.dropOnBelt(ne, it.item)) { items.shift(); i--; } }
      else if (ne && ne.kind === 'cross') { if (this.dropOnCross(ne, dirIdx, it.item)) { items.shift(); i--; } }
      else if (ne && (ne.kind === 'crafter' || ne.kind === 'box')) { if (this.insert(ne, it.item)) { items.shift(); i--; } }
    }
  }
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

  // 2a) crossings: orient each lane to the belts feeding it (before items move)
  list.forEach(function (e) {
    if (e.kind !== 'cross') return;
    e.dirH = self.crossLaneDir(e, true);
    e.dirV = self.crossLaneDir(e, false);
    e.anim++;
  });
  // 2b) belts advance items along their direction
  list.forEach(function (e) { if (e.kind === 'belt') self.advanceLane(e.items, e.x, e.y, e.dir, game); });
  // 2c) crossings advance both independent lanes
  list.forEach(function (e) {
    if (e.kind !== 'cross') return;
    self.advanceLane(e.itemsH, e.x, e.y, e.dirH, game);
    self.advanceLane(e.itemsV, e.x, e.y, e.dirV, game);
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
    // does the destination want this item right now?
    function wants(item) {
      if (dst.kind === 'box') return true;                       // boxes hold anything
      if (dst.kind === 'belt') return self.beltHasRoomAtStart(dst);
      return self.acceptsInput(dst, item);                       // crafter: only recipe items, not over-stocked
    }
    // pick the first item the destination actually wants, SKIPPING the rest
    var item = null;
    if (src.kind === 'belt') {
      var bestIdx = -1, bestPos = -1;                            // grab the most-advanced wanted item
      for (var ii = 0; ii < src.items.length; ii++) {
        if (wants(src.items[ii].item) && src.items[ii].pos > bestPos) { bestPos = src.items[ii].pos; bestIdx = ii; }
      }
      if (bestIdx < 0) return;
      item = src.items[bestIdx].item; src.items.splice(bestIdx, 1);
    } else if (src.kind === 'box') {
      for (var s in src.store) { if (src.store[s] > 0 && wants(s)) { item = s; break; } }
      if (!item) return;
      src.store[item]--; if (!src.store[item]) delete src.store[item];
    } else if (src.kind === 'crafter' || src.kind === 'refinery') {
      for (var o in src.outBuf) { if (src.outBuf[o] > 0 && wants(o)) { item = o; break; } }
      if (!item) return;
      src.outBuf[item]--; if (!src.outBuf[item]) delete src.outBuf[item];
    } else return;
    // give to destination
    if (dst.kind === 'belt') self.dropOnBelt(dst, item); else self.insert(dst, item);
    e.carryItem = item;   // remembered so the render can animate it being carried across
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
  var firstEver = !game.stats.produced[outItem];   // the very first time you craft this product
  game.onProduced(outItem, qty);
  if (firstEver) FAB.sfx('craft', { volume: 0.55 }); // once per product type, not for repeats
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
