'use strict';
var F = env.FAB;

describe('world generation', function () {
  test('same seed produces an identical biome map', function () {
    var a = new F.World('SEED_ALPHA'), b = new F.World('SEED_ALPHA');
    eq(a.biome.join(','), b.biome.join(','), 'deterministic from seed');
  });

  test('different seeds produce different maps', function () {
    var a = new F.World('SEED_ALPHA'), b = new F.World('SEED_BETA');
    ne(a.biome.join(','), b.biome.join(','), 'seed actually varies the world');
  });

  test('spawn centre is a gentle meadow', function () {
    var w = new F.World('SPAWN');
    eq(w.biomeAt((w.w / 2) | 0, (w.h / 2) | 0), 'meadow');
  });

  test('world has plenty of resource nodes', function () {
    var w = new F.World('NODES');
    ok(Object.keys(w.nodes).length > 50, 'expected many resource nodes, got ' + Object.keys(w.nodes).length);
  });

  test('map is the configured size', function () {
    var w = new F.World('SIZE');
    eq(w.w, F.MAP_W); eq(w.h, F.MAP_H);
    eq(w.biome.length, F.MAP_W * F.MAP_H);
  });
});
