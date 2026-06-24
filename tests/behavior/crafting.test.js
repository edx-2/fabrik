'use strict';
var F = env.FAB;
function adv(g, n) { for (var i = 0; i < (n || 1); i++) g.factory.tick(g); }

describe('crafting', function () {
  test('a furnace smelts iron ore into iron plates', function () {
    var g = env.stubGame(), f = g.factory;
    var fur = f.place('furnace', 5, 5, 0, g.world);
    fur.recipe = 'iron_plate'; fur.inBuf.iron_ore = 3;
    adv(g, F.RECIPES.iron_plate.time + 2);
    ok((fur.outBuf.iron_plate || 0) >= 1, 'produced at least one plate');
    ok((g.stats.produced.iron_plate || 0) >= 1, 'counted in stats');
  });

  test('a single machine buffers up to 10 (so Milestone 1 is reachable solo)', function () {
    var g = env.stubGame(), f = g.factory;
    var fur = f.place('furnace', 5, 5, 0, g.world);
    fur.recipe = 'iron_plate'; fur.inBuf.iron_ore = 999;
    adv(g, F.RECIPES.iron_plate.time * 12 + 5);
    eq(fur.outBuf.iron_plate, 10, 'output buffer caps at 10');
    eq(g.stats.produced.iron_plate, 10, 'exactly ten produced before back-pressure');
  });

  test('an assembler needs ALL inputs before it crafts', function () {
    var g = env.stubGame(), f = g.factory;
    var a = f.place('assembler', 5, 5, 0, g.world);
    a.recipe = 'iron_gear';                 // needs 2 iron_plate
    a.inBuf.iron_plate = 1;
    adv(g, F.RECIPES.iron_gear.time + 4);
    eq(a.outBuf.iron_gear || 0, 0, 'no craft with too few inputs');
    a.inBuf.iron_plate = 2;
    adv(g, F.RECIPES.iron_gear.time + 4);
    ok((a.outBuf.iron_gear || 0) >= 1, 'crafts once it has both plates');
  });

  test('a recipe with out>1 yields multiple items', function () {
    var g = env.stubGame(), f = g.factory;
    var a = f.place('assembler', 5, 5, 0, g.world);
    a.recipe = 'bolts';                     // 1 iron_plate -> 4 bolts
    a.inBuf.iron_plate = 1;
    adv(g, F.RECIPES.bolts.time + 4);
    eq(a.outBuf.bolts, 4);
  });

  test('a refinery only refines when oil is available in the pipe network', function () {
    var g = env.stubGame(), f = g.factory, w = g.world;
    f.place('pipe', 5, 6, 0, w);
    f.place('pipe', 6, 6, 0, w);            // a little pipe run
    var r = f.place('refinery', 5, 5, 0, w); // sits next to the pipes
    r.recipe = 'plastic';
    adv(g, F.RECIPES.plastic.time + 4);
    eq(r.outBuf.plastic || 0, 0, 'no oil -> no plastic');
    var grp = f.adjacentPipeGroup(r);
    ok(grp, 'refinery is adjacent to a pipe group');
    grp.oil = 50;
    adv(g, F.RECIPES.plastic.time + 4);
    ok((r.outBuf.plastic || 0) >= 1, 'refines plastic once the pipes hold oil');
  });
});
