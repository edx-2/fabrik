'use strict';
/* Runs every tests/behavior/*.test.js and exits non-zero on failure. */
var fs = require('fs'), path = require('path');
var H = require('./lib/harness');
var env = require('./lib/env');

// expose test DSL + env to the test files as globals
global.env = env; global.FAB = env.FAB;
global.describe = H.describe; global.test = H.test;
global.ok = H.ok; global.notOk = H.notOk; global.eq = H.eq; global.ne = H.ne;
global.deepEq = H.deepEq; global.approx = H.approx; global.throws = H.throws; global.fail = H.fail;

var dir = path.join(__dirname, 'behavior');
fs.readdirSync(dir).filter(function (f) { return /\.test\.js$/.test(f); }).sort()
  .forEach(function (f) { require(path.join(dir, f)); });

// some tests load ui.js; give the headless UI a stub modal so checkMilestone's
// tutorial trigger doesn't crash when a test isn't exercising the UI directly.
if (env.FAB.UI && (!env.FAB.UI.el || !env.FAB.UI.el.modal)) {
  var html = '', els = {};
  env.FAB.UI.el = env.FAB.UI.el || {};
  env.FAB.UI.el.modal = {
    dataset: {}, onclick: null,
    classList: { _h: true, add: function () {}, remove: function () {}, contains: function () { return false; } },
    set innerHTML(v) { html = v; els = {}; }, get innerHTML() { return html; },
    querySelector: function (s) { if (!els[s]) els[s] = { onclick: null }; return els[s]; },
    querySelectorAll: function () { return []; }
  };
}

process.exit(H.run());
