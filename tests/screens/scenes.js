/* Deterministic screenshot scenes. Loaded in the browser harness (sets
 * window.SCENES / window.SCENE_META) AND required by the Node runner (which only
 * reads META for the scene list + canvas sizes). Builders run in the browser. */
(function (root) {
  'use strict';

  // centre the camera on a tile and move the player far off-screen, for clean
  // showcase shots that aren't dominated by the player sprite.
  function focus(g, F, meta, tx, ty) {
    var T = F.TILE;
    g.cam = {
      x: F.clamp(tx * T + T / 2 - meta.w / 2, 0, g.world.w * T - meta.w),
      y: F.clamp(ty * T + T / 2 - meta.h / 2, 0, g.world.h * T - meta.h)
    };
    g.player.x = -1e6; g.player.y = -1e6;
    g._sceneFixedCam = true;
  }
  function injectNode(w, x, y, res) { w.nodes[(x) + ',' + (y)] = { res: res, amount: 999 }; }

  var SCENES = {
    // --- title / world select (no game) ---
    title: function () { /* harness shows the title screen */ },

    // --- terrain & biomes ---
    world: function (g, F, meta) {
      var w = g.world;
      function variety(tx, ty) {
        var s = {};
        for (var oy = -6; oy <= 6; oy += 2) for (var ox = -9; ox <= 9; ox += 2) s[w.biomeAt(tx + ox, ty + oy)] = 1;
        return Object.keys(s).length;
      }
      var best = { tx: (w.w / 2) | 0, ty: (w.h / 2) | 0 }, bestv = 0, rng = F.makeRng('cam');
      for (var i = 0; i < 6000; i++) {
        var tx = 12 + ((rng() * (w.w - 24)) | 0), ty = 10 + ((rng() * (w.h - 20)) | 0);
        var v = variety(tx, ty);
        if (v > bestv) { bestv = v; best = { tx: tx, ty: ty }; }
        if (bestv >= 5) break;
      }
      g.player.x = (best.tx + 0.5) * F.TILE; g.player.y = (best.ty + 0.5) * F.TILE;
    },

    // --- belts: straight runs + corners both ways, with cargo ---
    belts: function (g, F, meta) {
      var f = g.factory, w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      f.place('belt', cx - 3, cy - 1, 1, w); f.place('belt', cx - 2, cy - 1, 1, w);
      f.place('belt', cx - 1, cy - 1, 2, w); f.place('belt', cx - 1, cy, 2, w);
      f.place('belt', cx - 1, cy + 1, 1, w); f.place('belt', cx, cy + 1, 1, w);
      f.at(cx - 3, cy - 1).items = [{ item: 'iron_ore', pos: 0.5 }];
      f.at(cx - 1, cy).items = [{ item: 'coal', pos: 0.5 }];
      f.at(cx, cy + 1).items = [{ item: 'iron_plate', pos: 0.4 }];
      focus(g, F, meta, cx - 1, cy);
    },

    // --- belt bridge: overpass hides under-cargo, shows over-cargo + incoming ---
    bridge: function (g, F, meta) {
      var f = g.factory, w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      f.place('belt', cx - 2, cy, 1, w); f.place('belt', cx - 1, cy, 1, w);
      var br = f.place('crossing', cx, cy, 0, w); f.place('belt', cx + 1, cy, 1, w);
      f.place('belt', cx, cy - 2, 2, w); f.place('belt', cx, cy - 1, 2, w); f.place('belt', cx, cy + 1, 2, w);
      f.tick(g);
      f.at(cx - 1, cy).items = [{ item: 'iron_plate', pos: 0.92 }];       // incoming under-lane
      br.itemsH = [{ item: 'copper_plate', pos: 0.18 }, { item: 'iron_plate', pos: 0.5 }]; // 0.5 hidden under overpass
      f.at(cx, cy - 1).items = [{ item: 'iron_gear', pos: 0.92 }];
      br.itemsV = [{ item: 'iron_gear', pos: 0.5 }];                       // over the overpass
      focus(g, F, meta, cx, cy);
    },

    // --- a row of machines (placeholder or generated art) ---
    machines: function (g, F, meta) {
      var f = g.factory, w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      injectNode(w, cx - 8, cy, 'iron_ore'); injectNode(w, cx + 6, cy, 'crude_oil');
      f.place('drill', cx - 8, cy, 1, w);
      f.place('furnace', cx - 6, cy, 0, w);
      f.place('assembler', cx - 4, cy, 0, w);   // 2x2
      f.place('crusher', cx - 1, cy, 0, w);
      f.place('sawmill', cx + 1, cy, 0, w);
      f.place('box', cx + 3, cy, 0, w);
      f.place('pump', cx + 6, cy, 0, w);
      f.place('refinery', cx + 8, cy, 0, w);
      focus(g, F, meta, cx, cy);
    },

    // --- item icons riding a belt ---
    items: function (g, F, meta) {
      var f = g.factory, w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      var row = ['iron_ore', 'copper_ore', 'coal', 'stone', 'wood', 'iron_plate', 'iron_gear', 'rubber'];
      for (var i = 0; i < row.length; i++) {
        var b = f.place('belt', cx - 4 + i, cy, 1, w);
        b.items = [{ item: row[i], pos: 0.5 }];
      }
      focus(g, F, meta, cx, cy);
    },

    // --- car factory + road + parking + a parked car ---
    car: function (g, F, meta) {
      var f = g.factory, w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      f.place('car_factory', cx - 2, cy - 4, 2, w);     // door faces down
      f.place('road', cx - 1, cy, 0, w); f.place('road', cx - 1, cy + 1, 0, w);
      f.place('parking', cx, cy + 1, 0, w);
      g.cars.push(new F.Car((cx + 1) * F.TILE, (cy + 2) * F.TILE, 'blue', 'sporty'));
      focus(g, F, meta, cx, cy);
    },

    // --- oil: pump -> pipes -> refinery, with oil flowing ---
    oil: function (g, F, meta) {
      var f = g.factory, w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      injectNode(w, cx - 3, cy, 'crude_oil');
      f.place('pump', cx - 3, cy, 0, w);
      f.place('pipe', cx - 2, cy, 0, w); f.place('pipe', cx - 1, cy, 0, w); f.place('pipe', cx, cy, 0, w);
      f.place('refinery', cx + 1, cy, 0, w);
      focus(g, F, meta, cx - 1, cy);
    },

    // --- the build/drag ghost (belt facing a direction) ---
    ghost: function (g, F, meta) {
      var w = g.world, cx = (w.w / 2) | 0, cy = (w.h / 2) | 0;
      g.player.x = (cx + 0.5) * F.TILE; g.player.y = (cy + 1.5) * F.TILE;
      g.buildType = 'belt'; g.buildDir = 1; g.dragging = true; g.dragType = 'belt';
      g.update(0);
      g.input.mouse.x = meta.w / 2; g.input.mouse.y = meta.h / 2 - F.TILE; // hover a tile up from centre
    },

    // --- the full build bar (HUD) with everything unlocked ---
    hotbar: function (g, F, meta) {
      Object.keys(F.MACHINES).forEach(function (t) { g.unlocked[t] = true; });
      g.rebuildHotbar();
    },

    // --- a tutorial dialog (DOM modal) ---
    tutorial: function (g, F, meta) { F.UI.maybeTutorial(g, 7); },

    // --- the build menu (DOM modal) ---
    build_menu: function (g, F, meta) { Object.keys(F.MACHINES).forEach(function (t) { g.unlocked[t] = true; }); F.UI.toggleBuildMenu(); },

    // --- the tech tree (DOM modal) ---
    tech: function (g, F, meta) { F.UI.toggleTech(); },

    // --- the big resource map (canvas modal) ---
    map: function (g, F, meta) { g.mapOpen = true; }
  };

  // name, canvas size, seed, sim ticks to run, and flags
  var META = [
    { name: 'title', w: 460, h: 540, noStart: true },
    { name: 'world', w: 720, h: 500, seed: 'SHOWCASE' },
    { name: 'belts', w: 320, h: 300 },
    { name: 'bridge', w: 320, h: 300 },
    { name: 'machines', w: 600, h: 200 },
    { name: 'items', w: 360, h: 140 },
    { name: 'car', w: 380, h: 360 },
    { name: 'oil', w: 340, h: 200, ticks: 30 },
    { name: 'ghost', w: 280, h: 240 },
    { name: 'hotbar', w: 920, h: 460, hud: true },
    { name: 'tutorial', w: 760, h: 520, hud: true },
    { name: 'build_menu', w: 760, h: 560, hud: true },
    { name: 'tech', w: 760, h: 560, hud: true },
    { name: 'map', w: 720, h: 560 }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = { SCENES: SCENES, META: META };
  else { root.SCENES = SCENES; root.SCENE_META = META; }
})(typeof window !== 'undefined' ? window : this);
