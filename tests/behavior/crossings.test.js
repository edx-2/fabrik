'use strict';
var F = env.FAB;

function crossWith(build) {
  var f = env.newFactory(), w = env.flatWorld();
  var cr = f.place('crossing', 10, 10, 0, w);
  build(f, w, cr);
  return { f: f, w: w, cr: cr };
}

describe('belt bridge direction', function () {
  test('lane flows the way a feeding belt points', function () {
    var t = crossWith(function (f, w) { f.place('belt', 9, 10, 1, w); }); // belt to the west flowing east
    eq(t.f.crossLaneDir(t.cr, true), 1, 'horizontal lane flows east');
  });

  test('an OUTPUT-only belt to the west infers a westward lane', function () {
    var t = crossWith(function (f, w) { f.place('belt', 9, 10, 3, w); }); // a belt the bridge feeds, going west
    eq(t.f.crossLaneDir(t.cr, true), 3, 'inferred from the output, not defaulted east');
  });

  test('north (dir 0) is preserved — not lost to a falsy `|| 2` fallback', function () {
    var t = crossWith(function (f, w) { f.place('belt', 10, 11, 0, w); }); // belt below, flowing north into us
    eq(t.f.crossLaneDir(t.cr, false), 0, 'vertical lane flows north');
    var g = env.stubGame(t.w); g.factory = t.f;
    t.f.tick(g);
    eq(t.cr.dirV, 0, 'tick keeps it north (not flipped south)');
  });

  test('the two lanes carry items independently and never mix', function () {
    var t = crossWith(function (f, w, cr) { cr.dirH = 1; cr.dirV = 2; });
    ok(t.f.dropOnCross(t.cr, 1, 'iron_ore'), 'dropped on the horizontal lane');
    ok(t.f.dropOnCross(t.cr, 2, 'coal'), 'dropped on the vertical lane');
    eq(t.cr.itemsH.length, 1); eq(t.cr.itemsH[0].item, 'iron_ore');
    eq(t.cr.itemsV.length, 1); eq(t.cr.itemsV[0].item, 'coal');
  });
});
