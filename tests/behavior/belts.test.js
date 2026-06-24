'use strict';
var F = env.FAB;
function adv(g, n) { for (var i = 0; i < (n || 1); i++) g.factory.tick(g); }
function shapeOf(f, e) { return F.Game.prototype.beltShape.call({ factory: f }, e); }

describe('belts', function () {
  test('an item advances along a belt', function () {
    var g = env.stubGame(), f = g.factory;
    var b = f.place('belt', 5, 5, 1, g.world);
    ok(f.dropOnBelt(b, 'iron_ore'));
    var p0 = b.items[0].pos;
    adv(g, 3);
    ok(b.items[0].pos > p0, 'item position should increase');
  });

  test('an item transfers onto the next belt', function () {
    var g = env.stubGame(), f = g.factory;
    f.place('belt', 5, 5, 1, g.world);
    f.place('belt', 6, 5, 1, g.world);
    f.dropOnBelt(f.at(5, 5), 'iron_ore');
    adv(g, 30);
    eq(f.at(5, 5).items.length, 0, 'left the first belt');
    eq(f.at(6, 5).items.length, 1, 'arrived on the second belt');
  });

  test('a belt refuses a new item when its start is occupied (back-pressure)', function () {
    var g = env.stubGame(), f = g.factory;
    var b = f.place('belt', 5, 5, 1, g.world);
    ok(f.dropOnBelt(b, 'iron_ore'), 'first drop ok');
    notOk(f.dropOnBelt(b, 'coal'), 'second drop blocked while item at the start');
  });

  test('straight belt is detected as straight', function () {
    var g = env.stubGame(), f = g.factory;
    f.place('belt', 5, 5, 1, g.world);
    var b = f.place('belt', 6, 5, 1, g.world);
    eq(shapeOf(f, b).type, 'straight');
  });

  test('a turn is detected as a corner fed from the correct side', function () {
    var g = env.stubGame(), f = g.factory;
    f.place('belt', 5, 5, 1, g.world);     // flows east into (6,5)
    var corner = f.place('belt', 6, 5, 2, g.world); // turns south
    var s = shapeOf(f, corner);
    eq(s.type, 'corner');
    eq(s.from, 3, 'fed from the west');
  });

  test('a belt curves out of a belt bridge', function () {
    var g = env.stubGame(), f = g.factory;
    var cr = f.place('crossing', 8, 8, 0, g.world); cr.dirH = 1; // bridge flows east
    var b = f.place('belt', 9, 8, 2, g.world);                   // belt east of bridge, turning south
    var s = shapeOf(f, b);
    eq(s.type, 'corner', 'curves coming off the bridge');
    eq(s.from, 3, 'fed from the bridge to the west');
  });

  test('dragging a belt across a perpendicular belt auto-builds a bridge', function () {
    var g = env.stubGame(), f = g.factory;
    f.place('belt', 5, 5, 2, g.world); // a vertical belt
    var pl = { dragType: 'belt', unlocked: { belt: true, crossing: true }, factory: f, world: g.world };
    F.Game.prototype.placeLine.call(pl, 5, 5, 1); // drag a horizontal belt across it
    var at = f.at(5, 5);
    eq(at.kind, 'cross', 'became a bridge');
    eq(at.dirH, 1, 'horizontal lane keeps the drag direction');
    eq(at.dirV, 2, 'vertical lane keeps the original belt direction');
  });

  test('dragging across a PARALLEL belt just re-orients it (no bridge)', function () {
    var g = env.stubGame(), f = g.factory;
    f.place('belt', 5, 5, 1, g.world);
    var pl = { dragType: 'belt', unlocked: { belt: true, crossing: true }, factory: f, world: g.world };
    F.Game.prototype.placeLine.call(pl, 5, 5, 3); // same axis
    eq(f.at(5, 5).kind, 'belt', 'stays a belt');
  });
});
