'use strict';
var F = env.FAB;
require('../../js/ui.js'); // populates FAB.UI on the shared FAB namespace

function stubModal() {
  var html = '', els = {};
  return {
    dataset: {}, onclick: null,
    classList: { _h: true, add: function (c) { if (c === 'hidden') this._h = true; }, remove: function (c) { if (c === 'hidden') this._h = false; }, contains: function (c) { return c === 'hidden' && this._h; } },
    set innerHTML(v) { html = v; els = {}; }, get innerHTML() { return html; },
    querySelector: function (s) { if (!els[s]) els[s] = { onclick: null }; return els[s]; },
    querySelectorAll: function () { return []; }
  };
}

describe('feature tutorials', function () {
  test('every tutorial is keyed by a real milestone and has titled, bodied pages', function () {
    Object.keys(F.TUTORIALS).forEach(function (k) {
      var pages = F.TUTORIALS[k];
      ok(Array.isArray(pages) && pages.length > 0, 'M' + k + ' has pages');
      pages.forEach(function (p) { ok(p.title, 'page has a title'); ok(p.body, 'page has a body'); });
    });
  });

  test('a tutorial shows once, is remembered, and never re-shows', function () {
    var realSave = F.Save.save; F.Save.save = function () {}; // don't touch storage
    try {
      F.UI.el = { modal: stubModal() }; F.UI._tut = null;
      var game = { stats: { tutorialsSeen: {} } };

      F.UI.maybeTutorial(game, 2);
      ok(F.UI._tut, 'tutorial shown');
      ok(F.UI.el.modal.innerHTML.indexOf('Conveyor Belts') >= 0, 'shows the right content');

      F.UI.closeModal();
      ok(game.stats.tutorialsSeen[2], 'marked as seen');
      eq(F.UI._tut, null, 'cleared');

      F.UI.maybeTutorial(game, 2);
      eq(F.UI._tut, null, 'does not show again once seen');
    } finally { F.Save.save = realSave; }
  });

  test('Next walks pages and the last page closes the dialog', function () {
    var realSave = F.Save.save; F.Save.save = function () {};
    try {
      F.UI.el = { modal: stubModal() }; F.UI._tut = null;
      var game = { stats: { tutorialsSeen: {} } };
      F.UI.maybeTutorial(game, 7); // a 3-page tutorial
      eq(F.UI._tut.i, 0);
      F.UI.el.modal.querySelector('.tut-next').onclick();
      eq(F.UI._tut.i, 1, 'advanced a page');
      F.UI.el.modal.querySelector('.tut-next').onclick();
      F.UI.el.modal.querySelector('.tut-next').onclick(); // last page -> close
      eq(F.UI._tut, null, 'closed after the final page');
      ok(game.stats.tutorialsSeen[7]);
    } finally { F.Save.save = realSave; }
  });
});
