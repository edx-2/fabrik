'use strict';
var F = env.FAB;

describe('car factory delivery', function () {
  test('delivers along a road to a free parking spot', function () {
    var g = env.stubGame(), f = g.factory, w = g.world;
    var fac = f.place('car_factory', 10, 10, 2, w);   // door faces DOWN -> door tile (11,14)
    f.place('road', 11, 14, 0, w);
    f.place('road', 11, 15, 0, w);
    f.place('parking', 12, 15, 0, w);                 // 4x4 lot adjacent to the road
    var d = f.carDelivery(fac, g);
    ok(d, 'found a delivery route');
    eq(d.spotIndex, 0, 'first spot is free');
    ok(d.path.length > 0, 'has a path to drive');
  });

  test('no delivery when the factory is not road-linked to a lot', function () {
    var g = env.stubGame(), f = g.factory, w = g.world;
    var fac = f.place('car_factory', 10, 10, 2, w);
    f.place('parking', 30, 30, 0, w);                 // a lot, but no road to it
    notOk(f.carDelivery(fac, g));
  });

  test('a full lot blocks delivery', function () {
    var g = env.stubGame(), f = g.factory, w = g.world;
    var fac = f.place('car_factory', 10, 10, 2, w);
    f.place('road', 11, 14, 0, w); f.place('road', 11, 15, 0, w);
    var lot = f.place('parking', 12, 15, 0, w);
    // occupy every spot with parked cars
    for (var i = 0; i < f.PARK_SPOTS; i++) { var c = f.spotCenter(lot, i); g.cars.push({ x: c.x, y: c.y }); }
    notOk(f.carDelivery(fac, g), 'no free spot -> no delivery');
  });
});

describe('production stats', function () {
  test('onProduced records car colours and kinds', function () {
    var g = env.stubGame();
    g.onProduced('car', 1, { color: 'blue', kind: 'sporty' });
    g.onProduced('car', 1, { color: 'red', kind: 'super' });
    ok(g.stats.carColors.blue && g.stats.carColors.red, 'both colours tracked');
    eq(g.carKindCount('sporty'), 1);
    eq(g.carKindCount('super'), 1);
    eq(g.carKindCount('basic'), 0);
  });
});
