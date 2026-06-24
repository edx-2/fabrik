'use strict';
/* Minimal, dependency-free PNG read/write/compare for screenshot diffing.
 * Handles 8-bit PNGs with colour type 2 (RGB) or 6 (RGBA), no interlacing —
 * which is exactly what Chrome's --screenshot produces. Uses only Node's zlib. */

var zlib = require('zlib');
var fs = require('fs');

var SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC32 (PNG chunk checksums) ------------------------------------------
var CRC_TABLE = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ---- decode -> { width, height, data:Uint8Array(RGBA) } -------------------
function decode(buf) {
  if (!buf.slice(0, 8).equals(SIG)) throw new Error('not a PNG');
  var off = 8, width = 0, height = 0, colorType = 0, bitDepth = 0, idat = [];
  while (off < buf.length) {
    var len = buf.readUInt32BE(off); var type = buf.toString('ascii', off + 4, off + 8);
    var data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
      if (colorType !== 2 && colorType !== 6) throw new Error('unsupported colour type ' + colorType);
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') { idat.push(data); }
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  var raw = zlib.inflateSync(Buffer.concat(idat));
  var srcBpp = colorType === 6 ? 4 : 3;
  var stride = width * srcBpp;
  var out = new Uint8Array(width * height * 4);
  var prev = new Uint8Array(stride);
  var cur = new Uint8Array(stride);
  var p = 0;
  for (var y = 0; y < height; y++) {
    var filter = raw[p++];
    for (var x = 0; x < stride; x++) {
      var rawByte = raw[p++];
      var a = x >= srcBpp ? cur[x - srcBpp] : 0;
      var b = prev[x];
      var c = x >= srcBpp ? prev[x - srcBpp] : 0;
      var v;
      switch (filter) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: v = rawByte + paeth(a, b, c); break;
        default: throw new Error('bad filter ' + filter);
      }
      cur[x] = v & 0xff;
    }
    for (var px = 0; px < width; px++) {
      var si = px * srcBpp, di = (y * width + px) * 4;
      out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2];
      out[di + 3] = srcBpp === 4 ? cur[si + 3] : 255;
    }
    var tmp = prev; prev = cur; cur = tmp;
  }
  return { width: width, height: height, data: out };
}

// ---- encode RGBA -> PNG buffer (filter 0) ---------------------------------
function encode(img) {
  var w = img.width, h = img.height, data = img.data;
  var stride = w * 4;
  var raw = Buffer.alloc((stride + 1) * h);
  for (var y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (var x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = data[y * stride + x];
  }
  var idat = zlib.deflateSync(raw, { level: 6 });
  function chunk(type, payload) {
    var len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0);
    var tb = Buffer.from(type, 'ascii');
    var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, payload])), 0);
    return Buffer.concat([len, tb, payload, crc]);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- compare two RGBA images ----------------------------------------------
// tol = per-channel tolerance (0..255). Returns counts + a diff image that
// dims the original and paints changed pixels bright magenta.
function compare(a, b, tol) {
  tol = tol == null ? 16 : tol;
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, diffPixels: Math.max(a.width * a.height, b.width * b.height), total: Math.max(a.width * a.height, b.width * b.height), fraction: 1, diff: null };
  }
  var w = a.width, h = b.height, total = w * h, diffPixels = 0;
  var diff = new Uint8Array(total * 4);
  for (var i = 0; i < total; i++) {
    var o = i * 4;
    var dr = Math.abs(a.data[o] - b.data[o]);
    var dg = Math.abs(a.data[o + 1] - b.data[o + 1]);
    var db = Math.abs(a.data[o + 2] - b.data[o + 2]);
    var da = Math.abs(a.data[o + 3] - b.data[o + 3]);
    var maxD = Math.max(dr, dg, db, da);
    if (maxD > tol) {
      diffPixels++;
      diff[o] = 255; diff[o + 1] = 0; diff[o + 2] = 255; diff[o + 3] = 255;
    } else {
      // faint grey of the baseline so the diff image stays readable
      var g = (b.data[o] * 0.3 + b.data[o + 1] * 0.59 + b.data[o + 2] * 0.11) | 0;
      var dim = (g * 0.4 + 140) | 0;
      diff[o] = dim; diff[o + 1] = dim; diff[o + 2] = dim; diff[o + 3] = 255;
    }
  }
  return { sizeMismatch: false, diffPixels: diffPixels, total: total, fraction: diffPixels / total, diff: { width: w, height: h, data: diff } };
}

function read(file) { return decode(fs.readFileSync(file)); }
function write(file, img) { fs.writeFileSync(file, encode(img)); }

module.exports = { decode: decode, encode: encode, compare: compare, read: read, write: write };
