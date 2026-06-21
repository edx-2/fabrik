/* Fabrik — player character: walking, hand-mining, inventory, hand-craft. */
var FAB = window.FAB || (window.FAB = {});

FAB.Player = function (tx, ty) {
  this.x = (tx + 0.5) * FAB.TILE;   // pixel position (centre)
  this.y = (ty + 0.5) * FAB.TILE;
  this.speed = 150;                  // px / second
  this.dir = 2;                      // facing (0 up,1 right,2 down,3 left)
  this.moving = false;
  this.animTime = 0;
  this.inv = {};                     // item id -> count
  this.mineProgress = 0;
  this.mineTarget = null;
};

FAB.Player.prototype.tileX = function () { return Math.floor(this.x / FAB.TILE); };
FAB.Player.prototype.tileY = function () { return Math.floor(this.y / FAB.TILE); };

FAB.Player.prototype.give = function (item, n) { this.inv[item] = (this.inv[item] || 0) + (n || 1); };
FAB.Player.prototype.count = function (item) { return this.inv[item] || 0; };
FAB.Player.prototype.take = function (item, n) {
  n = n || 1; if ((this.inv[item] || 0) < n) return false;
  this.inv[item] -= n; if (this.inv[item] <= 0) delete this.inv[item]; return true;
};

FAB.Player.prototype.update = function (dt, game) {
  var inp = game.input, dx = 0, dy = 0;
  if (inp.held('up')) dy -= 1;
  if (inp.held('down')) dy += 1;
  if (inp.held('left')) dx -= 1;
  if (inp.held('right')) dx += 1;
  this.moving = (dx !== 0 || dy !== 0);
  if (this.moving) {
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 1 : 3; else this.dir = dy > 0 ? 2 : 0;
    var len = Math.hypot(dx, dy) || 1;
    var nx = this.x + (dx / len) * this.speed * dt;
    var ny = this.y + (dy / len) * this.speed * dt;
    if (game.canWalk(nx, this.y)) this.x = nx;
    if (game.canWalk(this.x, ny)) this.y = ny;
    this.animTime += dt;
  }

  // hand mining: hold action near a resource node, with no machine on it
  this.mineTarget = null;
  if (inp.held('action') && !game.buildType) {
    var f = FAB.DIR[this.dir];
    var tx = this.tileX() + f.x, ty = this.tileY() + f.y;
    var node = game.world.nodeAt(tx, ty);
    var occupied = game.factory.at(tx, ty);
    // allow mining the tile you stand on too
    if (!node) { tx = this.tileX(); ty = this.tileY(); node = game.world.nodeAt(tx, ty); occupied = game.factory.at(tx, ty); }
    if (node && !occupied && node.res !== 'crude_oil') {
      this.mineTarget = { x: tx, y: ty, res: node.res };
      this.mineProgress += dt;
      if (this.mineProgress >= 0.7) {
        this.mineProgress = 0;
        this.give(node.res, 1);
        game.onProduced(node.res, 1);
        game.toast('+1 ' + FAB.ITEMS[node.res].name);
        FAB.sfx('mine'); FAB.sfx('pickup', { minGap: 120 });
      }
    } else { this.mineProgress = 0; }
  } else { this.mineProgress = 0; }
};

FAB.Player.prototype.canHandcraft = function (type) {
  var r = FAB.HANDCRAFT[type]; if (!r) return false;
  for (var i = 0; i < r.length; i++) if (this.count(r[i][0]) < r[i][1]) return false;
  return true;
};
FAB.Player.prototype.handcraft = function (type) {
  var r = FAB.HANDCRAFT[type]; if (!r || !this.canHandcraft(type)) return false;
  for (var i = 0; i < r.length; i++) this.take(r[i][0], r[i][1]);
  this.give(type, 1); return true;
};
