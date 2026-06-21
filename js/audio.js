/* Fabrik — audio manager.
 * Loads sounds listed in assets/generated/sfx_manifest.js (window.FAB_SFX) and
 * plays them on game events. If no sounds are generated yet, every call is a
 * silent no-op, so the game always works. Use the FAB.sfx / FAB.sfxLoop helpers
 * (in util.js) which guard against this manager being absent (e.g. in tests). */
var FAB = window.FAB || (window.FAB = {});

FAB.Audio = {
  base: '',
  sounds: {},   // id -> { src, loop, volume, lastPlay, pool:[] }
  loops: {},    // id -> HTMLAudioElement currently looping
  muted: false,
  ready: false,

  init: function () {
    try { this.muted = localStorage.getItem('fabrik:muted') === '1'; } catch (e) {}
    var m = window.FAB_SFX;
    if (!m) { console.log('[audio] no sfx manifest — running silent'); return; }
    this.base = m.base || '';
    var self = this, defs = m.sounds || {};
    Object.keys(defs).forEach(function (id) {
      var d = defs[id];
      self.sounds[id] = {
        src: self.base + d.file, loop: !!d.loop,
        volume: (d.volume != null ? d.volume : 0.7), lastPlay: 0, pool: []
      };
    });
    this.ready = true;
    console.log('[audio] loaded', Object.keys(this.sounds).length, 'sounds');
  },

  // play a one-shot. opts: { volume, rate, minGap (ms) }
  play: function (id, opts) {
    if (this.muted) return;
    var s = this.sounds[id]; if (!s) return;
    opts = opts || {};
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (opts.minGap && now - s.lastPlay < opts.minGap) return;
    s.lastPlay = now;
    var a = null, i;
    for (i = 0; i < s.pool.length; i++) { if (s.pool[i].paused || s.pool[i].ended) { a = s.pool[i]; break; } }
    if (!a) { if (s.pool.length < 6) { a = new Audio(s.src); s.pool.push(a); } else { a = s.pool[0]; } }
    try {
      a.currentTime = 0;
      a.volume = FAB.clamp(opts.volume != null ? opts.volume : s.volume, 0, 1);
      a.playbackRate = opts.rate || 1;
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  },

  // start a seamless looping sound (e.g. ambient, drive). Idempotent.
  startLoop: function (id, volume) {
    if (this.loops[id]) return;
    var s = this.sounds[id]; if (!s) return;
    var a = new Audio(s.src); a.loop = true;
    a.volume = this.muted ? 0 : (volume != null ? volume : s.volume);
    this.loops[id] = a;
    var p = a.play(); if (p && p.catch) p.catch(function () {});
  },
  stopLoop: function (id) {
    var a = this.loops[id];
    if (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} delete this.loops[id]; }
  },

  setMuted: function (m) {
    this.muted = !!m;
    try { localStorage.setItem('fabrik:muted', m ? '1' : '0'); } catch (e) {}
    for (var id in this.loops) this.loops[id].volume = m ? 0 : (this.sounds[id] ? this.sounds[id].volume : 0.3);
    return this.muted;
  },
  toggleMute: function () { return this.setMuted(!this.muted); }
};
