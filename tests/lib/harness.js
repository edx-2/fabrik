'use strict';
/* Tiny zero-dependency test runner + assertions used by the behavioral tests.
 * Tests register with test()/describe(); run() executes them and returns an
 * exit code (0 = all passed). */

var groups = [];
var current = { name: '', tests: [] };
groups.push(current);

function describe(name, fn) {
  var prev = current;
  current = { name: name, tests: [] };
  groups.push(current);
  fn();
  current = prev;
}
function test(name, fn) { current.tests.push({ name: name, fn: fn }); }

function fmt(v) {
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}
function fail(msg) { throw new Error(msg || 'assertion failed'); }
function ok(cond, msg) { if (!cond) fail(msg || 'expected truthy, got ' + fmt(cond)); }
function notOk(cond, msg) { if (cond) fail(msg || 'expected falsy, got ' + fmt(cond)); }
function eq(a, b, msg) { if (a !== b) fail((msg ? msg + ': ' : '') + 'expected ' + fmt(b) + ', got ' + fmt(a)); }
function ne(a, b, msg) { if (a === b) fail((msg ? msg + ': ' : '') + 'expected != ' + fmt(b)); }
function deepEq(a, b, msg) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) fail((msg ? msg + ': ' : '') + 'expected ' + sb + ', got ' + sa);
}
function approx(a, b, tol, msg) {
  tol = (tol == null ? 1e-6 : tol);
  if (Math.abs(a - b) > tol) fail((msg ? msg + ': ' : '') + 'expected ~' + b + ' (±' + tol + '), got ' + a);
}
function throws(fn, msg) { try { fn(); } catch (e) { return; } fail(msg || 'expected an exception'); }

function run() {
  var pass = 0, failed = [];
  groups.forEach(function (g) {
    g.tests.forEach(function (t) {
      var label = (g.name ? g.name + ' › ' : '') + t.name;
      try { t.fn(); pass++; if (process.env.VERBOSE) console.log('  ✓ ' + label); }
      catch (e) { failed.push({ label: label, err: e }); }
    });
  });
  failed.forEach(function (f) {
    console.log('  ✗ ' + f.label);
    console.log('      ' + (f.err && f.err.message ? f.err.message : f.err));
    if (process.env.VERBOSE && f.err && f.err.stack) console.log(f.err.stack.split('\n').slice(1, 3).join('\n'));
  });
  console.log('\nbehavior: ' + pass + ' passed, ' + failed.length + ' failed');
  return failed.length ? 1 : 0;
}

module.exports = { describe: describe, test: test, run: run, ok: ok, notOk: notOk, eq: eq, ne: ne, deepEq: deepEq, approx: approx, throws: throws, fail: fail };
