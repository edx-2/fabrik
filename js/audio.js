/* Fabrik — audio manager.
 * Loads sounds listed in assets/generated/sfx_manifest.js (window.FAB_SFX) and
 * plays them on game events. If no sounds are generated yet, every call is a
 * silent no-op, so the game always works. Use the FAB.sfx / FAB.sfxLoop helpers
 * (in util.js) which guard against this manager being absent (e.g. in tests). */
var FAB = window.FAB || (window.FAB = {});

FAB.Audio = {
  base: '',
  sounds: {},   // id -> { src, loop, volume, lastPlay, pool:[] }
  loops: {},    // id -> { web, src/el, gain, vol } currently looping
  muted: false,
  ready: false,
  actx: null,   // Web Audio context (for gapless loops); null if unavailable
  buffers: {},  // id -> AudioBuffer | 'loading' | 'failed'
  // loop only the clean front of a sound (seconds), skipping a trailing stop in
  // the generated file. Overridable per-sound via the manifest's loopEnd.
  loopEndDefaults: { belt_loop: 6 },

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
        volume: (d.volume != null ? d.volume : 0.7), lastPlay: 0, pool: [],
        loopEnd: (d.loopEnd != null ? d.loopEnd : self.loopEndDefaults[id])
      };
    });
    // Web Audio gives gapless loops; eagerly decode the looping sounds. Decoding
    // needs the bytes via fetch, which is blocked on file:// — in that case we
    // fall back to (near-seamless) HTMLAudio looping.
    try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) this.actx = new AC(); } catch (e) { this.actx = null; }
    if (this.actx) Object.keys(this.sounds).forEach(function (id) { if (self.sounds[id].loop) self._decode(id); });
    this.ready = true;
    console.log('[audio] loaded', Object.keys(this.sounds).length, 'sounds', this.actx ? '(web audio)' : '');
  },

  _decode: function (id) {
    if (!this.actx || this.buffers[id]) return;
    var self = this; this.buffers[id] = 'loading';
    fetch(this.sounds[id].src)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { return self.actx.decodeAudioData(buf); })
      .then(function (audio) { self.buffers[id] = audio; })
      .catch(function () { self.buffers[id] = 'failed'; });
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

  // start a seamless looping sound (e.g. ambient, belt, drive). Idempotent.
  startLoop: function (id, volume) {
    if (this.loops[id]) return;
    var s = this.sounds[id]; if (!s) return;
    var vol = volume != null ? volume : s.volume;
    var buf = this.buffers[id];
    if (this.actx && buf && buf !== 'loading' && buf !== 'failed') {
      // gapless Web Audio loop (with optional loopEnd to skip a trailing stop)
      try { if (this.actx.state === 'suspended') this.actx.resume(); } catch (e) {}
      var src = this.actx.createBufferSource(); src.buffer = buf; src.loop = true;
      if (s.loopEnd && s.loopEnd < buf.duration) { src.loopStart = 0; src.loopEnd = s.loopEnd; }
      var g = this.actx.createGain(); g.gain.value = this.muted ? 0 : vol;
      src.connect(g); g.connect(this.actx.destination);
      try { src.start(0); } catch (e) {}
      this.loops[id] = { web: true, src: src, gain: g, vol: vol };
      return;
    }
    if (this.actx && !buf) this._decode(id);          // try to upgrade next time
    var a = new Audio(s.src);
    if (s.loopEnd) {
      // HTMLAudio can't set a loop region, so seek back near the trim point
      a.loop = false; var le = s.loopEnd;
      a.addEventListener('timeupdate', function () { if (a.currentTime >= le) { try { a.currentTime = 0; } catch (e) {} } });
      a.addEventListener('ended', function () { try { a.currentTime = 0; a.play(); } catch (e) {} });
    } else { a.loop = true; }
    a.volume = this.muted ? 0 : vol;
    this.loops[id] = { web: false, el: a, vol: vol };
    var p = a.play(); if (p && p.catch) p.catch(function () {});
  },
  stopLoop: function (id) {
    var L = this.loops[id]; if (!L) return;
    try { if (L.web) L.src.stop(); else { L.el.pause(); L.el.currentTime = 0; } } catch (e) {}
    delete this.loops[id];
  },
  // adjust the volume of an already-playing loop (e.g. distance-based fade)
  setLoopVolume: function (id, vol) {
    var L = this.loops[id]; if (!L) return;
    L.vol = vol;
    if (this.muted) return;
    try { if (L.web) L.gain.gain.value = vol; else L.el.volume = vol < 0 ? 0 : (vol > 1 ? 1 : vol); } catch (e) {}
  },

  setMuted: function (m) {
    this.muted = !!m;
    try { localStorage.setItem('fabrik:muted', m ? '1' : '0'); } catch (e) {}
    for (var id in this.loops) { var L = this.loops[id]; if (L.web) L.gain.gain.value = m ? 0 : L.vol; else L.el.volume = m ? 0 : L.vol; }
    return this.muted;
  },
  toggleMute: function () { return this.setMuted(!this.muted); }
};
