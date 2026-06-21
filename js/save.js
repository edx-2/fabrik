/* Fabrik — save/load to localStorage (one slot per world seed). */
var FAB = window.FAB || (window.FAB = {});

FAB.Save = {
  keyFor: function (seed) { return 'fabrik:world:' + seed; },

  save: function (game) {
    try {
      var ents = [];
      game.factory.eachEntity(function (e) {
        ents.push({
          t: e.type, x: e.x, y: e.y, dir: e.dir, recipe: e.recipe,
          inBuf: e.inBuf, outBuf: e.outBuf, store: e.store,
          items: e.kind === 'belt' ? e.items : undefined,
          itemsH: e.kind === 'cross' ? e.itemsH : undefined,
          itemsV: e.kind === 'cross' ? e.itemsV : undefined,
          dirH: e.dirH, dirV: e.dirV,
          carColor: e.carColor, carKind: e.carKind
        });
      });
      var data = {
        v: 1, seed: game.seed,
        player: { x: game.player.x, y: game.player.y, inv: game.player.inv },
        ents: ents,
        cars: game.cars.map(function (c) { return { x: c.x, y: c.y, color: c.color, kind: c.kind, angle: c.angle }; }),
        stats: game.stats,
        milestone: game.milestoneIndex,
        unlocked: Object.keys(game.unlocked)
      };
      localStorage.setItem(this.keyFor(game.seed), JSON.stringify(data));
      return true;
    } catch (err) { console.warn('save failed', err); return false; }
  },

  load: function (seed) {
    try {
      var raw = localStorage.getItem(this.keyFor(seed));
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  },

  listWorlds: function () {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('fabrik:world:') === 0) {
        try { var d = JSON.parse(localStorage.getItem(k)); out.push({ seed: d.seed, milestone: d.milestone }); } catch (e) {}
      }
    }
    return out;
  },

  remove: function (seed) { localStorage.removeItem(this.keyFor(seed)); }
};
