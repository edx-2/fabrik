/* Fabrik — factory simulation.
 * Owns every placed machine/belt/pipe and steps the whole factory each tick.
 * Resource nodes are treated as infinite (kid-friendly: patches never run dry). */
var FAB = window.FAB || (window.FAB = {});

var BELT_SPEED = 0.17;   // fraction of a tile per tick
var BELT_GAP = 0.34;     // min spacing between items on a belt
var OUT_CAP = 3;         // max finished items a machine buffers before it stops (back-pressure)
var PIPE_CAP = 60;       // oil capacity per connected pipe group

FAB.Factory = function () {
  this.ents = {};        // "x,y" -> entity (top-left tile for multi-tile)
  this.owner = {};       // "x,y" -> key of the entity occupying this tile
  this.pipeDirty = true;
  this.groups = [];      // [{ cells:[keys], oil, cap }]
  this.cellGroup = {};   // pipe cell key -> group index
  this.structVer = 0;    // bumped when machines are placed/removed (for render caches)
  this._list = null;     // cached entity array, rebuilt only when structure changes
};

// stable entity array — avoids allocating Object.keys().map() every tick
FAB.Factory.prototype.entList = function () {
  if (!this._list) { this._list = []; for (var k in this.ents) this._list.push(this.ents[k]); }
  return this._list;
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
  this.structVer++; this._list = null;
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
  this.structVer++; this._list = null;
  refunds[e.type] = (refunds[e.type] || 0) + 1; // the machine itself
  return refunds;
};

// ---- acceptance / transfer helpers ----------------------------------------
FAB.Factory.prototype.acceptsInput = function (e, item) {
  if (e.kind === 'box') return true;
  if (e.kind === 'crafter') {
    var r = e.recipe && FAB.RECIPES[e.recipe];
    if (!r) return false;
    // back-pressure: once the output buffer is full (OUT_CAP), refuse new input so
    // grabbers stop loading this machine and the material flows on to others.
    var outItem = (r.out && typeof r.out === 'string') ? r.out : e.recipe;
    if ((e.outBuf[outItem] || 0) >= OUT_CAP) return false;
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
  // a belt/bridge neighbour "flows" in direction d if its output goes that way
  function flows(n, d) {
    if (!n) return false;
    if (n.kind === 'belt') return n.dir === d;
    if (n.kind === 'cross') return ((d & 1) ? n.dirH : n.dirV) === d;
    return false;
  }
  function sink(n) { return n && (n.kind === 'crafter' || n.kind === 'box'); }
  if (horiz) {
    var wl = this.at(e.x - 1, e.y), er = this.at(e.x + 1, e.y);
    if (flows(wl, 1)) return 1;            // west neighbour feeds east INTO us
    if (flows(er, 3)) return 3;            // east neighbour feeds west INTO us
    if (flows(er, 1) || sink(er)) return 1; // we OUTPUT east into an east-flowing belt / machine
    if (flows(wl, 3) || sink(wl)) return 3; // we OUTPUT west
    return e.dirH || 1;
  }
  var up = this.at(e.x, e.y - 1), dn = this.at(e.x, e.y + 1);
  if (flows(up, 2)) return 2;              // above feeds south INTO us
  if (flows(dn, 0)) return 0;              // below feeds north INTO us
  if (flows(dn, 2) || sink(dn)) return 2;  // we OUTPUT south
  if (flows(up, 0) || sink(up)) return 0;  // we OUTPUT north
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
  if (items.length > 1) items.sort(function (a, b) { return b.pos - a.pos; });
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
  var list = this.entList();

  // 1) pumps add oil
  list.forEach(function (e) {
    if (e.kind !== 'pump') return;
    var g = self.adjacentPipeGroup(e);
    if (g && g.oil < g.cap) g.oil = Math.min(g.cap, g.oil + 2);
    e.anim++;
  });

  // 2a) crossings: orient each lane to the belts feeding it (before items move).
  // If a lane flips, bump structVer so neighbouring belts re-evaluate their corners.
  list.forEach(function (e) {
    if (e.kind !== 'cross') return;
    var nh = self.crossLaneDir(e, true), nv = self.crossLaneDir(e, false);
    if (nh !== e.dirH || nv !== e.dirV) { e.dirH = nh; e.dirV = nv; self.structVer++; }
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
    // a car factory only builds when it's road-linked to a parking lot with a free spot
    if (e.type === 'car_factory' && !self.carDelivery(e, game)) return;
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

// the tile just outside a car factory's garage door (front-centre, by facing)
FAB.Factory.prototype.doorTile = function (e) {
  var s = e.size;
  switch (e.dir) {
    case 0: return { x: e.x + 1, y: e.y - 1 };   // up
    case 1: return { x: e.x + s, y: e.y + 1 };   // right
    case 2: return { x: e.x + 1, y: e.y + s };   // down
    default: return { x: e.x - 1, y: e.y + 1 };  // left
  }
};
// pixel centre of parking spot `idx` (0..3) — a 2x2 grid of spaces in the 4x4 lot
FAB.Factory.prototype.spotCenter = function (e, idx) {
  var T = FAB.TILE, col = idx % 2, row = (idx / 2) | 0;
  return { x: (e.x + col * 2 + 1) * T, y: (e.y + row * 2 + 1) * T };
};
FAB.Factory.prototype.PARK_SPOTS = 4;
// first free spot index in a lot (a spot is taken by a parked car or one en route)
FAB.Factory.prototype.freeSpot = function (e, game) {
  var T = FAB.TILE, r2 = (T * 0.8) * (T * 0.8);
  for (var idx = 0; idx < this.PARK_SPOTS; idx++) {
    var c = this.spotCenter(e, idx), taken = false;
    for (var i = 0; i < game.cars.length; i++) {
      var car = game.cars[i];
      if (car.deliver) { if (car.deliver.parking === e && car.deliver.spotIndex === idx) { taken = true; break; } }
      else if (FAB.dist2(car.x, car.y, c.x, c.y) < r2) { taken = true; break; }
    }
    if (!taken) return idx;
  }
  return -1;
};
// BFS over road tiles from the factory door to a parking lot that has a free spot.
// Returns { parking, spotIndex, path:[pixel waypoints] } or null.
FAB.Factory.prototype.carDelivery = function (e, game) {
  var door = this.doorTile(e), start = this.at(door.x, door.y);
  if (!start || start.kind !== 'road') return null;
  var T = FAB.TILE, startK = FAB.key(door.x, door.y), prev = {}; prev[startK] = null;
  var q = [door], qi = 0;
  while (qi < q.length) {
    var cur = q[qi++], curK = FAB.key(cur.x, cur.y);
    for (var d = 0; d < 4; d++) {
      var pe = this.at(cur.x + FAB.DIR[d].x, cur.y + FAB.DIR[d].y);
      if (pe && pe.kind === 'parking') {
        var spot = this.freeSpot(pe, game);
        if (spot >= 0) {
          var path = [], k = curK;
          while (k !== null && k !== undefined) { var p = k.split(',').map(Number); path.push({ x: (p[0] + 0.5) * T, y: (p[1] + 0.5) * T }); k = prev[k]; }
          path.reverse();
          var sc = this.spotCenter(pe, spot); path.push({ x: sc.x, y: sc.y });
          return { parking: pe, spotIndex: spot, path: path };
        }
      }
    }
    for (var d2 = 0; d2 < 4; d2++) {
      var rx = cur.x + FAB.DIR[d2].x, ry = cur.y + FAB.DIR[d2].y, rk = FAB.key(rx, ry);
      if (rk in prev) continue;
      var re = this.at(rx, ry);
      if (re && re.kind === 'road') { prev[rk] = curK; q.push({ x: rx, y: ry }); }
    }
  }
  return null;
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
