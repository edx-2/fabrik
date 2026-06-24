'use strict';
var F = env.FAB;

describe('save / load', function () {
  test('round-trips entities, belt cargo, recipes, stats, milestone and unlocks', function () {
    var g = env.newGame('SAVE_RT');
    g.factory.place('belt', 5, 5, 1, g.world);
    g.factory.dropOnBelt(g.factory.at(5, 5), 'iron_ore');
    var fur = g.factory.place('furnace', 7, 7, 0, g.world);
    fur.recipe = 'iron_plate'; fur.outBuf.iron_plate = 3;
    g.stats.produced.iron_plate = 3;
    g.milestoneIndex = 2; g.unlocked.belt = true; g.unlocked.grabber = true;
    ok(F.Save.save(g), 'saved ok');

    var data = F.Save.load('SAVE_RT');
    ok(data, 'loaded raw save');
    var g2 = env.newGame('SAVE_RT', data);

    eq(g2.milestoneIndex, 2, 'milestone restored');
    ok(g2.unlocked.belt && g2.unlocked.grabber, 'unlocks restored');
    var belt = g2.factory.at(5, 5);
    ok(belt && belt.kind === 'belt', 'belt restored');
    eq(belt.items.length, 1, 'belt cargo restored');
    eq(belt.items[0].item, 'iron_ore');
    var fur2 = g2.factory.at(7, 7);
    eq(fur2.recipe, 'iron_plate', 'recipe restored');
    eq(fur2.outBuf.iron_plate, 3, 'output buffer restored');
    eq(g2.stats.produced.iron_plate, 3, 'stats restored');
  });

  test('a belt bridge round-trips its two independent lanes', function () {
    var g = env.newGame('SAVE_CROSS');
    var cr = g.factory.place('crossing', 9, 9, 0, g.world);
    cr.dirH = 3; cr.dirV = 0; // west + north
    cr.itemsH = [{ item: 'iron_ore', pos: 0.4 }];
    cr.itemsV = [{ item: 'coal', pos: 0.6 }];
    F.Save.save(g);
    var g2 = env.newGame('SAVE_CROSS', F.Save.load('SAVE_CROSS'));
    var cr2 = g2.factory.at(9, 9);
    eq(cr2.kind, 'cross');
    eq(cr2.dirH, 3); eq(cr2.dirV, 0);
    eq(cr2.itemsH[0].item, 'iron_ore');
    eq(cr2.itemsV[0].item, 'coal');
  });
});
