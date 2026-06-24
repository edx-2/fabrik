'use strict';
var F = env.FAB;
function tileOf(g) { return { x: Math.round(g.player.x / F.TILE), y: Math.round(g.player.y / F.TILE) }; }

describe('belt hum proximity', function () {
  test('audible right next to a belt, silent when far away', function () {
    var g = env.newGame('HUM'); var p = tileOf(g);
    g.factory.place('belt', p.x, p.y, 1, g.world);
    var near = g._nearestBeltVol();
    ok(near > 0.08, 'loud on top of a belt, got ' + near);
    ok(near <= g.BELT_HUM_MAX + 1e-9, 'never louder than the cap');

    g.factory.remove(p.x, p.y);
    g.factory.place('belt', p.x + 20, p.y + 20, 1, g.world);
    eq(g._nearestBeltVol(), 0, 'silent when no belt is in range');
  });

  test('quieter with distance', function () {
    var g = env.newGame('HUM2'); var p = tileOf(g);
    g.factory.place('belt', p.x + 1, p.y, 1, g.world);
    var close = g._nearestBeltVol();
    g.factory.remove(p.x + 1, p.y);
    g.factory.place('belt', p.x + 3, p.y, 1, g.world);
    var far = g._nearestBeltVol();
    ok(close > far, 'closer belt is louder (' + close.toFixed(3) + ' > ' + far.toFixed(3) + ')');
    ok(far > 0, 'still faintly audible at mid range');
  });

  test('a belt bridge hums too', function () {
    var g = env.newGame('HUM3'); var p = tileOf(g);
    g.factory.place('crossing', p.x, p.y, 0, g.world);
    ok(g._nearestBeltVol() > 0.08, 'bridges count as belts for the hum');
  });
});
