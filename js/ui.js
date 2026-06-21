/* Fabrik — UI overlay (DOM). Title screen, hotbar, build menu, recipe picker,
 * milestone card, inventory, toasts. Big icons + short words for young players. */
var FAB = window.FAB || (window.FAB = {});

FAB.UI = {
  game: null,
  el: {},

  // ---- boot: show the title / world-select screen -------------------------
  boot: function (canvas) {
    this.canvas = canvas;
    FAB.Assets.init();
    this.buildOverlay();
    this.showTitle();
  },

  buildOverlay: function () {
    var root = document.getElementById('ui');
    root.innerHTML = '';
    function mk(cls, parent, html) { var d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; (parent || root).appendChild(d); return d; }
    this.el.title = mk('screen', root);
    this.el.hud = mk('hud hidden', root);
    this.el.milestone = mk('milestone', this.el.hud);
    this.el.toasts = mk('toasts', this.el.hud);
    this.el.hotbar = mk('hotbar', this.el.hud);
    this.el.buttons = mk('buttons', this.el.hud);
    this.el.modal = mk('modal hidden', root);
    this.el.bag = mk('bag hidden', root);

    // top buttons
    var self = this;
    this.el.buttons.innerHTML =
      '<button id="btnBuild">🧰 Build (B)</button>' +
      '<button id="btnTech">📖 Tech (O)</button>' +
      '<button id="btnBag">🎒 Bag (Tab)</button>' +
      '<button id="btnHelp">🤖 Help (H)</button>' +
      '<button id="btnMenu">⏸️ Menu</button>';
    this.el.buttons.querySelector('#btnBuild').onclick = function () { self.toggleBuildMenu(); };
    this.el.buttons.querySelector('#btnTech').onclick = function () { self.toggleTech(); };
    this.el.buttons.querySelector('#btnBag').onclick = function () { self.toggleBag(); };
    this.el.buttons.querySelector('#btnHelp').onclick = function () { self.help(); };
    this.el.buttons.querySelector('#btnMenu').onclick = function () { self.showTitle(); };
  },

  // ---- title / world select ----------------------------------------------
  showTitle: function () {
    if (this.game) { this.game.stop(); FAB.Save.save(this.game); }
    this.el.hud.classList.add('hidden');
    this.el.modal.classList.add('hidden');
    this.el.title.classList.remove('hidden');
    var worlds = FAB.Save.listWorlds();
    var html = '<div class="card">' +
      '<h1>🏭🚗 Fabrik</h1>' +
      '<p>Build a factory. Make a car. Drive it!</p>' +
      '<div class="row"><input id="seed" placeholder="magic word (e.g. RAINBOW)" maxlength="16"/>' +
      '<button id="newWorld">🎲 New World</button></div>';
    if (worlds.length) {
      html += '<h3>Your Worlds</h3><div class="worlds">';
      worlds.forEach(function (w) {
        html += '<div class="world"><b>' + w.seed + '</b><span>Milestone ' + ((w.milestone || 0) + 1) + '/10</span>' +
          '<button data-seed="' + w.seed + '" class="cont">▶ Play</button>' +
          '<button data-seed="' + w.seed + '" class="del">🗑</button></div>';
      });
      html += '</div>';
    }
    html += '<p class="hint">Move: arrows/WASD · Mine: hold Space · Build: B · Drive: E</p></div>';
    this.el.title.innerHTML = html;
    var self = this;
    var seedInput = this.el.title.querySelector('#seed');
    this.el.title.querySelector('#newWorld').onclick = function () {
      var s = (seedInput.value || '').trim() || ('world' + ((Math.random() * 9999) | 0));
      self.startGame(s, null);
    };
    Array.prototype.forEach.call(this.el.title.querySelectorAll('.cont'), function (b) {
      b.onclick = function () { var s = b.getAttribute('data-seed'); self.startGame(s, FAB.Save.load(s)); };
    });
    Array.prototype.forEach.call(this.el.title.querySelectorAll('.del'), function (b) {
      b.onclick = function () { if (confirm('Delete world ' + b.getAttribute('data-seed') + '?')) { FAB.Save.remove(b.getAttribute('data-seed')); self.showTitle(); } };
    });
  },

  startGame: function (seed, saved) {
    if (this.game) this.game.stop();
    this.game = new FAB.Game(this.canvas, seed, saved);
    this.el.title.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.renderHotbar();
    this.game.start();
  },

  // ---- hotbar -------------------------------------------------------------
  renderHotbar: function () {
    var g = this.game, html = '';
    g.hotbar.forEach(function (t, i) {
      var m = FAB.MACHINES[t];
      html += '<div class="slot" data-t="' + t + '"><span class="num">' + (i + 1) + '</span>' +
        '<span class="ic">' + m.icon + '</span><span class="nm">' + m.name + '</span></div>';
    });
    this.el.hotbar.innerHTML = html;
    var self = this;
    Array.prototype.forEach.call(this.el.hotbar.querySelectorAll('.slot'), function (s) {
      s.onclick = function () { var t = s.getAttribute('data-t'); self.game.buildType = (self.game.buildType === t) ? null : t; };
    });
  },

  // ---- build menu (full grid, shows locked items) -------------------------
  toggleBuildMenu: function () {
    if (!this.el.modal.classList.contains('hidden') && this.el.modal.dataset.kind === 'build') { this.closeModal(); return; }
    var g = this.game, order = ['drill', 'furnace', 'belt', 'grabber', 'box', 'assembler', 'crusher', 'sawmill', 'pump', 'pipe', 'refinery', 'car_factory', 'parking'];
    var html = '<h2>🧰 Build</h2><div class="grid">';
    order.forEach(function (t) {
      var m = FAB.MACHINES[t], lk = !g.unlocked[t];
      html += '<div class="bitem' + (lk ? ' locked' : '') + '" data-t="' + t + '">' +
        '<div class="ic">' + (lk ? '🔒' : m.icon) + '</div><div class="nm">' + m.name + '</div>' +
        (lk ? '<div class="ms">Milestone ' + m.unlock + '</div>' : '<div class="ms">place it</div>') + '</div>';
    });
    html += '</div><button class="close">Close</button>';
    this.openModal('build', html);
    var self = this;
    Array.prototype.forEach.call(this.el.modal.querySelectorAll('.bitem:not(.locked)'), function (b) {
      b.onclick = function () { self.game.buildType = b.getAttribute('data-t'); self.closeModal(); };
    });
  },

  // ---- tech tree / recipe book (press O) ----------------------------------
  toggleTech: function () {
    if (!this.el.modal.classList.contains('hidden') && this.el.modal.dataset.kind === 'tech') { this.closeModal(); return; }
    var g = this.game;
    var carName = { car_basic: 'Basic Car', car_sporty: 'Sporty Car', car_super: 'Super Car' };

    // where each raw resource comes from
    var resBiome = {};
    for (var bk in FAB.BIOME_RES) FAB.BIOME_RES[bk].forEach(function (res) { resBiome[res] = bk; });

    function ings(r) {
      return r.inputs.map(function (i) {
        return '<span class="ing">' + (FAB.ITEMS[i[0]] ? FAB.ITEMS[i[0]].icon : '?') + '<small>×' + i[1] + '</small></span>';
      }).join('<span class="plus">+</span>');
    }
    function badge(unlocked, ms) {
      return unlocked ? '<span class="av ok">✅ ready</span>' : '<span class="av lk">🔒 Milestone ' + ms + '</span>';
    }

    var html = '<h2>📖 Tech Tree &amp; Recipes</h2>' +
      '<p class="legend">Ingredients go <b>into</b> a machine and the result comes out. ' +
      '<span class="av ok">✅ ready</span> = you can make it now · <span class="av lk">🔒</span> = unlocks at a later milestone.</p>';

    // raw materials
    html += '<h3 class="tech-h">⛏️ Raw materials — gather these</h3><div class="grid">';
    ['iron_ore', 'copper_ore', 'coal', 'stone', 'wood', 'crude_oil'].forEach(function (id) {
      var it = FAB.ITEMS[id], biome = resBiome[id] ? FAB.BIOMES[resBiome[id]].name : '—';
      var oil = id === 'crude_oil';
      var ok = oil ? !!g.unlocked.pump : true; // solids can be hand-mined from the start
      var how = oil ? 'Oil Pump' : 'Drill / by hand';
      html += '<div class="bitem' + (ok ? '' : ' locked') + '">' +
        '<div class="ic">' + it.icon + '</div><div class="nm">' + it.name + '</div>' +
        '<div class="ms">🗺️ ' + biome + '<br>' + how + '</div></div>';
    });
    html += '</div>';

    // recipes grouped by the machine that makes them, in unlock order
    var machines = ['furnace', 'crusher', 'sawmill', 'assembler', 'refinery', 'car_factory']
      .filter(function (m) { return FAB.recipesFor(m).length; })
      .sort(function (a, b) { return FAB.MACHINES[a].unlock - FAB.MACHINES[b].unlock; });

    machines.forEach(function (mt) {
      var md = FAB.MACHINES[mt], unlocked = !!g.unlocked[mt];
      html += '<h3 class="tech-h' + (unlocked ? '' : ' off') + '">' + md.icon + ' ' + md.name +
        ' ' + badge(unlocked, md.unlock) + '</h3><div class="recipes">';
      FAB.recipesFor(mt).forEach(function (rid) {
        var r = FAB.RECIPES[rid];
        var outId = (r.out && typeof r.out === 'string') ? r.out : rid;
        var qty = (typeof r.out === 'number') ? r.out : 1;
        var icon = outId === 'car' ? '🚗' : FAB.ITEMS[outId].icon;
        var name = outId === 'car' ? carName[rid] : FAB.ITEMS[outId].name;
        html += '<div class="recipe' + (unlocked ? '' : ' locked') + '">' +
          '<span class="ins">' + ings(r) + '</span>' +
          '<span class="to">➜</span>' +
          '<span class="out"><span class="oi">' + icon + '</span> ' + name + (qty > 1 ? ' ×' + qty : '') + '</span>' +
          badge(unlocked, md.unlock) + '</div>';
      });
      html += '</div>';
    });

    html += '<button class="close">Close</button>';
    this.openModal('tech', html);
  },

  // ---- recipe picker (and car colour picker) ------------------------------
  openRecipe: function (game, e) {
    var recs = FAB.recipesFor(e.type);
    var html = '<h2>' + FAB.MACHINES[e.type].name + '</h2>';
    if (recs.length <= 1) { html += '<p>This machine makes ' + (recs[0] ? FAB.ITEMS[FAB.RECIPES[recs[0]].out || recs[0]].name : 'one thing') + ' automatically.</p>'; }
    html += '<div class="grid">';
    recs.forEach(function (rid) {
      var r = FAB.RECIPES[rid];
      var outId = (r.out && typeof r.out === 'string') ? r.out : rid;
      var icon = outId === 'car' ? '🚗' : FAB.ITEMS[outId].icon;
      var name = outId === 'car' ? ({ car_basic: 'Basic Car', car_sporty: 'Sporty Car', car_super: 'Super Car' }[rid]) : FAB.ITEMS[outId].name;
      var ing = r.inputs.map(function (i) { return (FAB.ITEMS[i[0]].icon) + 'x' + i[1]; }).join(' ');
      html += '<div class="bitem' + (e.recipe === rid ? ' sel' : '') + '" data-r="' + rid + '">' +
        '<div class="ic">' + icon + '</div><div class="nm">' + name + '</div><div class="ms">' + ing + '</div></div>';
    });
    html += '</div>';
    if (e.type === 'car_factory') {
      html += '<h3>Car colour</h3><div class="colors">';
      FAB.CAR_COLORS.forEach(function (c) {
        html += '<div class="sw' + (e.carColor === c.id ? ' sel' : '') + '" data-c="' + c.id + '" style="background:' + c.hex + '" title="' + c.name + '"></div>';
      });
      html += '</div>';
    }
    html += '<button class="close">Close</button>';
    this.openModal('recipe', html);
    var self = this;
    Array.prototype.forEach.call(this.el.modal.querySelectorAll('.bitem'), function (b) {
      b.onclick = function () {
        var rid = b.getAttribute('data-r'); e.recipe = rid;
        if (FAB.RECIPES[rid].carKind) e.carKind = FAB.RECIPES[rid].carKind;
        self.openRecipe(game, e);
      };
    });
    Array.prototype.forEach.call(this.el.modal.querySelectorAll('.sw'), function (b) {
      b.onclick = function () { e.carColor = b.getAttribute('data-c'); self.openRecipe(game, e); };
    });
  },

  openModal: function (kind, html) {
    this.el.modal.dataset.kind = kind;
    this.el.modal.innerHTML = '<div class="panel">' + html + '</div>';
    this.el.modal.classList.remove('hidden');
    var self = this;
    var c = this.el.modal.querySelector('.close'); if (c) c.onclick = function () { self.closeModal(); };
    this.el.modal.onclick = function (ev) { if (ev.target === self.el.modal) self.closeModal(); };
  },
  closeModal: function () { this.el.modal.classList.add('hidden'); this.el.modal.innerHTML = ''; this.el.modal.dataset.kind = ''; },

  // ---- inventory bag ------------------------------------------------------
  toggleBag: function () {
    if (!this.el.bag.classList.contains('hidden')) { this.el.bag.classList.add('hidden'); return; }
    var inv = this.game.player.inv, html = '<h2>🎒 Backpack</h2><div class="grid">';
    var keys = Object.keys(inv).filter(function (k) { return inv[k] > 0; });
    if (!keys.length) html += '<p>Empty — go mine some Iron! ⛏️</p>';
    keys.forEach(function (k) {
      html += '<div class="bitem"><div class="ic">' + FAB.ITEMS[k].icon + '</div><div class="nm">' + FAB.ITEMS[k].name + '</div><div class="ms">x' + inv[k] + '</div></div>';
    });
    html += '</div><button class="close">Close</button>';
    this.el.bag.innerHTML = '<div class="panel">' + html + '</div>';
    this.el.bag.classList.remove('hidden');
    var self = this;
    this.el.bag.querySelector('.close').onclick = function () { self.el.bag.classList.add('hidden'); };
  },

  help: function () {
    var m = this.game.currentMilestone();
    var msg = m ? ('Milestone ' + m.n + ': ' + m.blurb) : 'You finished every milestone — free play! Build cars, race, and grapple. 🏆';
    this.game.toast('🤖 ' + msg);
  },

  // ---- per-frame HUD update ----------------------------------------------
  renderHUD: function (g) {
    // Esc closes whatever dialog is open (modal panels or the backpack)
    if (g.input.pressed('menu')) {
      if (!this.el.modal.classList.contains('hidden')) this.closeModal();
      else if (!this.el.bag.classList.contains('hidden')) this.el.bag.classList.add('hidden');
    }

    // keyboard shortcuts that open DOM panels
    if (g.input.pressed('build')) this.toggleBuildMenu();
    if (g.input.pressed('tech')) this.toggleTech();
    if (g.input.pressed('bag')) this.toggleBag();
    if (g.input.pressed('help')) this.help();

    // milestone card
    var m = g.currentMilestone();
    if (m) {
      var goal = m.goal(g);
      this.el.milestone.innerHTML = '<div class="mtitle">⭐ M' + m.n + ': ' + m.title + '</div>' +
        '<div class="mblurb">' + m.blurb + '</div>' +
        '<div class="mprog">' + goal.label + ': <b>' + Math.min(goal.have, goal.need) + ' / ' + goal.need + '</b></div>';
    } else {
      this.el.milestone.innerHTML = '<div class="mtitle">🏆 All milestones done!</div><div class="mblurb">Free play: build cars, race & grapple.</div>';
    }

    // toasts
    this.el.toasts.innerHTML = g.toasts.map(function (t) { return '<div class="toast" style="opacity:' + FAB.clamp(t.t, 0, 1) + '">' + t.msg + '</div>'; }).join('');

    // hotbar selection highlight
    var bt = g.buildType;
    Array.prototype.forEach.call(this.el.hotbar.querySelectorAll('.slot'), function (s) {
      s.classList.toggle('active', s.getAttribute('data-t') === bt);
    });
    if (this._lastHotbar !== g.hotbar.length) { this._lastHotbar = g.hotbar.length; this.renderHotbar(); }
  }
};
