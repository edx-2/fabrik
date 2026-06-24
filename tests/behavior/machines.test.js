'use strict';
var F = env.FAB;
function adv(g, n) { for (var i = 0; i < (n || 1); i++) g.factory.tick(g); }
// a fresh, water-free world with explicit resource nodes injected
function worldWithNodes(nodes) {
  var w = new F.World('MACHTEST'); w.isWater = function () { return false; };
  nodes.forEach(function (n) { w.nodes[F.key(n.x, n.y)] = { res: n.res, amount: n.amount || 999 }; });
  return w;
}

describe('miner', function () {
  test('a drill on ore feeds the belt in front of it', function () {
    var w = worldWithNodes([{ x: 20, y: 20, res: 'iron_ore' }]);
    var g = env.stubGame(w), f = g.factory;
    f.place('drill', 20, 20, 1, w);       // faces east
    f.place('belt', 21, 20, 1, w);        // output belt
    adv(g, 20);
    ok((g.stats.produced.iron_ore || 0) >= 1, 'mined at least one ore');
    ok(f.at(21, 20).items.length >= 1, 'ore landed on the belt');
  });
});

describe('grabber arm', function () {
  test('moves an item from the belt behind it into a box in front', function () {
    var g = env.stubGame(), f = g.factory, w = g.world;
    var src = f.place('belt', 20, 20, 1, w);
    f.place('grabber', 21, 20, 1, w);     // grabs from the west, drops to the east
    f.place('box', 22, 20, 0, w);
    f.dropOnBelt(src, 'iron_ore');
    adv(g, 10);
    ok((f.at(22, 20).store.iron_ore || 0) >= 1, 'box received the ore');
  });
});

describe('oil pump + pipes', function () {
  test('a pump on oil fills the connected pipe network', function () {
    var w = worldWithNodes([{ x: 30, y: 30, res: 'crude_oil' }]);
    var g = env.stubGame(w), f = g.factory;
    f.place('pump', 30, 30, 0, w);
    f.place('pipe', 31, 30, 0, w);
    f.place('pipe', 32, 30, 0, w);
    adv(g, 12);
    var grp = f.adjacentPipeGroup(f.at(30, 30));
    ok(grp, 'pump is next to a pipe group');
    ok(grp.oil > 0, 'oil accumulated in the pipes');
  });
});
