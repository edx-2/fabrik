'use strict';
/* Captures each scene with headless Chrome and compares it to a committed golden
 * PNG. Run with --update to (re)write the goldens when a change is intended.
 *   node tests/run-screens.js                 compare all
 *   node tests/run-screens.js --scene=bridge  compare one
 *   node tests/run-screens.js --update        regenerate goldens
 * Override the browser with CHROME=/path/to/chrome. */

var cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
var png = require('./lib/png');
var META = require('./screens/scenes.js').META;

var HERE = __dirname;
var HARNESS = 'file:///' + path.join(HERE, 'screens', 'harness.html').replace(/\\/g, '/');
var OUT = path.join(HERE, 'screens', 'out');
var GOLD = path.join(HERE, 'screens', 'golden');
var DIFF = path.join(HERE, 'screens', 'diff');
[OUT, GOLD, DIFF].forEach(function (d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

var UPDATE = process.argv.indexOf('--update') >= 0;
var ONLY = (process.argv.filter(function (a) { return a.indexOf('--scene=') === 0; })[0] || '').split('=')[1];
var TOL = 18;             // per-channel tolerance (absorbs anti-aliasing jitter)
var FAIL_FRACTION = 0.003; // > 0.3% of pixels changed => report as a difference

function findChrome() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'
  ];
  for (var i = 0; i < c.length; i++) if (c[i] && fs.existsSync(c[i])) return c[i];
  return null;
}
var CHROME = findChrome();
if (!CHROME) { console.error('Chrome/Chromium not found. Set CHROME=/path/to/chrome'); process.exit(2); }
var PROFILE = path.join(os.tmpdir(), 'fabrik_screens_profile');

function capture(m) {
  var out = path.join(OUT, m.name + '.png');
  try { fs.unlinkSync(out); } catch (e) {}
  var args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + PROFILE, '--force-device-scale-factor=1', '--force-color-profile=srgb',
    '--window-size=' + m.w + ',' + m.h, '--virtual-time-budget=6000',
    '--screenshot=' + out, HARNESS + '?scene=' + m.name
  ];
  cp.execFileSync(CHROME, args, { stdio: 'ignore' });
  if (!fs.existsSync(out)) throw new Error('no screenshot produced');
  return out;
}

var list = META.filter(function (m) { return !ONLY || m.name === ONLY; });
if (!list.length) { console.error('no such scene: ' + ONLY); process.exit(2); }

var failures = 0;
console.log((UPDATE ? 'Updating' : 'Comparing') + ' ' + list.length + ' screenshot scene(s) with ' + path.basename(CHROME) + '\n');
list.forEach(function (m) {
  process.stdout.write('  • ' + m.name + ' … ');
  var out;
  try { out = capture(m); } catch (e) { console.log('CAPTURE FAILED (' + e.message + ')'); failures++; return; }
  var goldFile = path.join(GOLD, m.name + '.png');
  if (UPDATE) { fs.copyFileSync(out, goldFile); console.log('golden written'); return; }
  if (!fs.existsSync(goldFile)) { console.log('NO GOLDEN — run: node tests/run-screens.js --update'); failures++; return; }
  var got, want;
  try { got = png.read(out); want = png.read(goldFile); }
  catch (e) { console.log('decode error: ' + e.message); failures++; return; }
  var c = png.compare(want, got, TOL);
  if (c.sizeMismatch) { console.log('SIZE CHANGED ' + want.width + 'x' + want.height + ' -> ' + got.width + 'x' + got.height); failures++; return; }
  if (c.fraction > FAIL_FRACTION) {
    console.log('CHANGED — ' + c.diffPixels + ' px (' + (c.fraction * 100).toFixed(2) + '%)  diff: tests/screens/diff/' + m.name + '.png');
    if (c.diff) png.write(path.join(DIFF, m.name + '.png'), c.diff);
    failures++;
  } else {
    console.log('ok' + (c.diffPixels ? ' (' + c.diffPixels + ' px within tolerance)' : ''));
  }
});

if (UPDATE) { console.log('\nscreens: goldens updated (' + list.length + ').'); process.exit(0); }
console.log('\nscreens: ' + (list.length - failures) + ' ok, ' + failures + ' changed/failed' + (failures ? ' — review tests/screens/diff/, then `--update` if intended' : ''));
process.exit(failures ? 1 : 0);
