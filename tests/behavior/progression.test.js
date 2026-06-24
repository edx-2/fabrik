'use strict';
var F = env.FAB;
var M = F.MILESTONES;
function milestone(n) { for (var i = 0; i < M.length; i++) if (M[i].n === n) return M[i]; return null; }

describe('milestones', function () {
  test('a new game starts on Milestone 1 with its machines unlocked', function () {
    var g = env.newGame('PROG1');
    eq(g.milestoneIndex, 0);
    ok(g.unlocked.drill && g.unlocked.furnace, 'M1 machines available');
    notOk(g.unlocked.belt, 'belts not yet unlocked');
  });

  test('reaching the goal advances the milestone and unlocks the next tier', function () {
    var g = env.newGame('PROG2');
    g.stats.produced.iron_plate = 10;     // M1 goal: 10 iron plates
    g.checkMilestone();
    eq(g.milestoneIndex, 1, 'advanced to M2');
    ok(g.unlocked.belt && g.unlocked.grabber, 'M2 unlocks belts & arms');
  });

  test('M9 needs an actual spoiler-bearing car, not just the spoiler part', function () {
    var g = env.newGame('PROG9');
    var goal = milestone(9).goal;
    g.stats.produced.spoiler = 5;                 // built parts only
    eq(goal(g).have, 0, 'parts do not count');
    g.onProduced('car', 1, { kind: 'sporty' });   // a real sporty car
    eq(goal(g).have, 1, 'a car with a spoiler counts');
  });

  test('M10 needs a Super car (a super car also satisfies M9)', function () {
    var g = env.newGame('PROG10');
    g.onProduced('car', 1, { kind: 'super' });
    eq(milestone(10).goal(g).have, 1, 'super car completes M10');
    eq(milestone(9).goal(g).have, 1, 'super car has a spoiler too');
  });

  test('M8 counts DISTINCT car colours', function () {
    var g = env.newGame('PROG8');
    g.onProduced('car', 1, { color: 'red' });
    g.onProduced('car', 1, { color: 'red' });
    eq(milestone(8).goal(g).have, 1, 'same colour twice = 1');
    g.onProduced('car', 1, { color: 'blue' });
    g.onProduced('car', 1, { color: 'green' });
    eq(milestone(8).goal(g).have, 3);
  });

  test('every milestone has a working goal function', function () {
    var g = env.newGame('PROGALL');
    M.forEach(function (m) {
      var r = m.goal(g);
      ok(typeof r.have === 'number' && typeof r.need === 'number' && r.label, 'M' + m.n + ' goal shape');
    });
  });
});

describe('build bar', function () {
  test('the hotbar shows every unlocked buildable in order', function () {
    var g = env.newGame('HOTBAR');
    Object.keys(F.MACHINES).forEach(function (t) { g.unlocked[t] = true; });
    g.rebuildHotbar();
    var order = ['drill', 'belt', 'grabber', 'crossing', 'furnace', 'assembler', 'crusher', 'sawmill', 'pump', 'pipe', 'refinery', 'box', 'road', 'car_factory', 'parking'];
    deepEq(g.hotbar, order, 'all unlocked machines, in the canonical order');
  });

  test('the hotbar only lists unlocked machines', function () {
    var g = env.newGame('HOTBAR2'); // only M1 unlocked
    ok(g.hotbar.indexOf('drill') >= 0);
    eq(g.hotbar.indexOf('belt'), -1, 'belt not listed before it unlocks');
  });
});
