/* Fabrik — asset manager.
 * If assets/generated/manifest.js was produced by the Gemini pipeline it sets
 * window.FAB_ASSETS = { base:'assets/generated/', images:{ id:{file,frames,cols,rows} } }.
 * When an image is missing we draw a friendly placeholder so the game is fully
 * playable before any art exists. */
var FAB = window.FAB || (window.FAB = {});

FAB.Assets = {
  base: '',
  defs: {},
  imgs: {},      // id -> HTMLImageElement (once loaded)
  ready: {},     // id -> true when loaded ok
  terrainVersion: 0, // bumped when a tile_* texture loads, so terrain chunks rebake

  init: function () {
    var m = window.FAB_ASSETS;
    if (!m) { console.log('[assets] no manifest — using placeholder art'); return; }
    this.base = m.base || '';
    this.defs = m.images || {};
    var self = this;
    Object.keys(this.defs).forEach(function (id) {
      var d = self.defs[id];
      var img = new Image();
      img.onload = function () { self.ready[id] = true; if (id.indexOf('tile_') === 0) self.terrainVersion++; };
      img.onerror = function () { console.warn('[assets] failed', id, d.file); };
      img.src = self.base + d.file;
      self.imgs[id] = img;
    });
    console.log('[assets] loading', Object.keys(this.defs).length, 'images');
  },

  has: function (id) { return !!this.ready[id]; },

  // Draw a (possibly multi-frame sprite-sheet) asset into a destination box.
  // frame index selects a cell when the def has cols/rows.
  draw: function (ctx, id, dx, dy, dw, dh, frame) {
    if (!this.ready[id]) return false;
    var img = this.imgs[id], d = this.defs[id];
    var cols = d.cols || 1, rows = d.rows || 1;
    if (cols > 1 || rows > 1) {
      var fw = img.width / cols, fh = img.height / rows;
      frame = (frame || 0) % (cols * rows);
      var sx = (frame % cols) * fw, sy = ((frame / cols) | 0) * fh;
      ctx.drawImage(img, sx, sy, fw, fh, dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    return true;
  }
};

// ---- placeholder drawing helpers (used when no art is present) -------------
FAB.Placeholder = {
  // a tinted rounded box with an emoji glyph centred
  box: function (ctx, x, y, w, h, color, glyph) {
    ctx.save();
    FAB.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, Math.min(8, w * 0.18));
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    if (glyph) {
      ctx.font = Math.floor(h * 0.55) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x + w / 2, y + h / 2 + 1);
    }
    ctx.restore();
  },
  // a small item token (colored disc + glyph)
  token: function (ctx, x, y, r, color, glyph) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    if (glyph && r > 6) {
      ctx.font = Math.floor(r * 1.3) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x, y + 0.5);
    }
    ctx.restore();
  }
};
