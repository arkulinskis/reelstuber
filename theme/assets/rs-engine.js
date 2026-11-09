/* rs-engine.js: moved unchanged from the JavaScript version (web/pages/_c_engine.html). RS.plan, RS.render, RS.Player, RS.exportClip, RS.stylePreview. */
(function () {
  'use strict';
  var RS = window.RS;
  var INK = '#1A1033';

  RS.dims = function (aspect, quality) {
    var b = quality === '720' ? 720 : 1080;
    return { '1:1': [b, b], '4:5': [b, Math.round(b * 1.25)], '16:9': [Math.round(b * 16 / 9), b] }[aspect] || [b, Math.round(b * 16 / 9)];
  };
  RS.FONT_CSS = { 'Anton': '400 {s}px "Anton", Impact, sans-serif', 'Bangers': '400 {s}px "Bangers", "Comic Sans MS", sans-serif',
    'Bricolage Grotesque': '800 {s}px "Bricolage Grotesque", "DM Sans", sans-serif', 'DM Sans': '700 {s}px "DM Sans", system-ui, sans-serif',
    'Luckiest Guy': '400 {s}px "Luckiest Guy", "Bangers", sans-serif', 'Bungee': '400 {s}px "Bungee", Impact, sans-serif',
    'Titan One': '400 {s}px "Titan One", "Anton", sans-serif', 'Lilita One': '400 {s}px "Lilita One", "Anton", sans-serif',
    'Permanent Marker': '400 {s}px "Permanent Marker", "Comic Sans MS", cursive', 'Pacifico': '400 {s}px "Pacifico", cursive',
    'Rubik Mono One': '400 {s}px "Rubik Mono One", Impact, sans-serif', 'Playfair Display': '900 {s}px "Playfair Display", Georgia, serif' };
  RS.FONT_SCALE = { 'Anton': 1, 'Bangers': 1.1, 'Bricolage Grotesque': 0.86, 'DM Sans': 0.82, 'Luckiest Guy': 0.9, 'Bungee': 0.74,
    'Titan One': 0.86, 'Lilita One': 0.98, 'Permanent Marker': 0.9, 'Pacifico': 0.8, 'Rubik Mono One': 0.66, 'Playfair Display': 0.84 };
  var fontsReady = null;
  RS.fontsReady = function () {
    if (!fontsReady) fontsReady = document.fonts ? Promise.all(Object.keys(RS.FONT_CSS).map(function (k) { return RS.FONT_CSS[k].split(', ')[0].replace('{s}', '60'); })
      .map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () {}) : Promise.resolve();
    return fontsReady;
  };
  function font(name, size) { return (RS.FONT_CSS[name] || RS.FONT_CSS.Anton).replace('{s}', Math.round(size)); }

  /* ------------------------------------------------------------------ plan: style + kept parts + captions */
  RS.plan = function (clip, words, analysis) {
    var st = RS.fullStyle(clip.style);
    var segs = st.cutSilence ? RS.keepRanges(analysis, clip.start, clip.end, st.silence) : [[clip.start, clip.end]];
    var srcLen = segs.reduce(function (a, s) { return a + s[1] - s[0]; }, 0);
    var plan = { clip: clip, st: st, segs: segs, srcLen: srcLen, outDur: srcLen / st.speed, analysis: analysis,
      cues: st.captions ? RS.cues(words, clip.start, clip.end, st.capWords) : [], joins: [] };
    // where a cut transition plays: the jump cuts, and (if asked) the video's own scene changes
    var acc = 0, joins = [];
    segs.forEach(function (sg, i) { if (i) joins.push(acc / st.speed); acc += sg[1] - sg[0]; });
    if (st.transScenes && analysis && analysis.cuts) analysis.cuts.forEach(function (c) {
      if (c > clip.start + 0.3 && c < clip.end - 0.3 && segs.some(function (sg) { return c > sg[0] + 0.1 && c < sg[1] - 0.1; })) joins.push(RS.srcToOut(plan, c));
    });
    joins.sort(function (a, b) { return a - b; });
    joins.forEach(function (j) { if (j > st.transLen && j < plan.outDur - st.transLen && (!plan.joins.length || j - plan.joins[plan.joins.length - 1] > st.transLen * 1.5)) plan.joins.push(j); });
    return plan;
  };
  RS.srcToOut = function (plan, t) {
    var acc = 0;
    for (var i = 0; i < plan.segs.length; i++) {
      var s = plan.segs[i];
      if (t < s[0]) return acc / plan.st.speed;
      if (t <= s[1]) return (acc + t - s[0]) / plan.st.speed;
      acc += s[1] - s[0];
    }
    return acc / plan.st.speed;
  };
  RS.outToSrc = function (plan, o) {
    var left = o * plan.st.speed;
    for (var i = 0; i < plan.segs.length; i++) {
      var s = plan.segs[i], len = s[1] - s[0];
      if (left <= len) return s[0] + left;
      left -= len;
    }
    var last = plan.segs[plan.segs.length - 1];
    return last ? last[1] : 0;
  };

  /* ------------------------------------------------------------------ drawing helpers */
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  RS.rr = rr;
  function cover(g, src, sw, sh, x, y, w, h, zoom, fx, fy) {
    var sc = Math.max(w / sw, h / sh) * zoom, dw = sw * sc, dh = sh * sc;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.drawImage(src, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
    g.restore();
  }
  var scratch = document.createElement('canvas'); scratch.width = 40; scratch.height = 72;
  function blurBg(g, src, sw, sh, W, H) {
    var h = Math.max(8, Math.round(40 * H / W));
    if (scratch.height !== h) scratch.height = h;
    var sg = scratch.getContext('2d');
    cover(sg, src, sw, sh, 0, 0, 40, h, 1.25, 0.5, 0.5);
    g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(scratch, 0, 0, W, H);
    g.fillStyle = 'rgba(10,6,20,.3)'; g.fillRect(0, 0, W, H); g.restore();
  }
  function ease(x) { x = RS.clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function popIn(x) { x = RS.clamp(x, 0, 1); var c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function punchAt(plan, t) {
    if (!plan.st.punch || !plan.analysis || !plan.analysis.env) return 1;
    var m = 0;
    for (var k = 0; k < 6; k++) m = Math.max(m, RS.levelAt(plan.analysis, t - k * 0.05));
    return 1 + 0.075 * ease((m - 0.62) / 0.38);
  }
  function wrapWords(g, items, maxW, gap) {
    var lines = [[]], lw = 0;
    items.forEach(function (it) {
      var w = it.w;
      if (lines[lines.length - 1].length && lw + gap + w > maxW) { lines.push([]); lw = 0; }
      var line = lines[lines.length - 1];
      lw += (line.length ? gap : 0) + w; line.push(it);
    });
    return lines;
  }
  function lineWidth(line, gap) { return line.reduce(function (a, it, i) { return a + it.w + (i ? gap : 0); }, 0); }

  /* ------------------------------------------------------------------ one frame */
  RS.render = function (g, W, H, src, plan, tSrc, tOut, opt) {
    opt = opt || {};
    var st = plan.st, u = Math.min(W, H) / 1080, vr = null;  // vr: where the video sits (the colour grade stays inside it)
    var sw = src && (src.videoWidth || src.width), sh = src && (src.videoHeight || src.height);
    if (opt.boxes) opt.boxes.length = 0;
    g.save();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (sw && sh && st.layout === 'pip') {
      cover(g, src, sw, sh, 0, 0, W, H, st.zoom * punchAt(plan, tSrc), st.fx, st.fy);
      drawPip(g, W, H, u, src, sw, sh, plan);
    } else if (sw && sh) {
      var pz = punchAt(plan, tSrc), z = st.zoom * pz;
      if (st.layout === 'split') {
        var h1 = Math.round(H * st.split);
        cover(g, src, sw, sh, 0, 0, W, h1, z, st.fx, st.fy);
        cover(g, src, sw, sh, 0, h1, W, H - h1, st.zoom2, st.fx2, st.fy2);
        g.fillStyle = INK; g.fillRect(0, h1 - 7 * u, W, 14 * u);
        g.fillStyle = st.hl; g.fillRect(0, h1 - 3 * u, W, 6 * u);
      } else if (st.layout === 'fit' || st.layout === 'framed') {
        if (st.layout === 'fit') blurBg(g, src, sw, sh, W, H);
        else {
          g.fillStyle = st.bg; g.fillRect(0, 0, W, H);
          g.fillStyle = 'rgba(255,255,255,.14)';
          for (var dy = 30 * u; dy < H; dy += 60 * u) for (var dx = ((dy / (60 * u)) % 2) * 30 * u; dx < W; dx += 60 * u) { g.beginPath(); g.arc(dx, dy, 5 * u, 0, 7); g.fill(); }
        }
        var maxW = st.layout === 'framed' ? W * 0.88 : W, maxH = st.layout === 'framed' ? H * 0.62 : H;
        var sc = Math.min(maxW / sw, maxH / sh), fw = sw * sc, fh = sh * sc;
        var fx0 = (W - fw) / 2, fy0 = (H - fh) / 2 - (st.layout === 'framed' ? H * 0.02 : 0);
        if (st.layout === 'framed') {
          vr = { x: fx0, y: fy0, w: fw, h: fh };
          g.fillStyle = INK; rr(g, fx0 + 14 * u, fy0 + 14 * u, fw, fh, 30 * u); g.fill();
          g.save(); rr(g, fx0, fy0, fw, fh, 30 * u); g.clip(); cover(g, src, sw, sh, fx0, fy0, fw, fh, z, st.fx, st.fy); g.restore();
          g.lineWidth = 8 * u; g.strokeStyle = INK; rr(g, fx0, fy0, fw, fh, 30 * u); g.stroke();
        } else cover(g, src, sw, sh, fx0, fy0, fw, fh, z, st.fx, st.fy);
      } else {
        cover(g, src, sw, sh, 0, 0, W, H, z, st.fx, st.fy);
      }
    }
    var still = !!opt.noFade;
    if (sw && sh && st.grade && st.grade !== 'none' && st.gradeAmt > 0) {
      // colour grade; with gradeWipe a before/after slider sweeps across in the first seconds
      var wp = st.gradeWipe && !still ? wipeAt(tOut) : 1;
      if (wp < 1) { if (wipeCv.width !== W || wipeCv.height !== H) { wipeCv.width = W; wipeCv.height = H; } wipeCv.getContext('2d').drawImage(g.canvas, 0, 0); }
      RS.grade(g, st.grade, st.gradeAmt, vr || { x: 0, y: 0, w: W, h: H });
      if (wp < 1) {
        var lx = Math.round(W * wp);
        if (lx < W) g.drawImage(wipeCv, lx, 0, W - lx, H, lx, 0, W - lx, H);
        if (wp > 0) {
          g.save(); g.fillStyle = '#FFFFFF'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10 * u; g.fillRect(lx - 3 * u, 0, 6 * u, H);
          g.beginPath(); g.arc(lx, H * 0.52, 36 * u, 0, 7); g.fill(); g.shadowBlur = 0;
          g.fillStyle = INK; g.font = '700 ' + Math.round(34 * u) + 'px "DM Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('‹ ›', lx, H * 0.52 + 1 * u);
          g.restore();
        }
      }
    }
    var tr = still ? null : transAt(plan, tOut), walling = !still && wallOn(plan, tOut);
    if (walling) drawWall(g, W, H, u, plan, tOut);
    else if (tr) moveFrame(g, W, H, u, tr, tOut);
    var layers = st.layers || [], back = layers.some(function (L) { return L.behind && (L.id === opt.selected || inSpan(layerSpan(L, plan), tOut)); });
    if (back) {
      // text behind the person: cut the person out of this frame, draw the "behind" layers, put the person back on top
      var key = [W, H, tSrc.toFixed(3), st.layout, st.zoom, st.fx, st.fy, st.zoom2, st.fx2, st.fy2, st.grade, st.gradeAmt, tr || walling ? tOut.toFixed(3) : ''].join('|');
      var person = sw && sh ? RS.person.cutout(g.canvas, W, H, key) : null;
      drawLayers(g, W, H, u, plan, tOut, opt, 'behind');
      if (person) g.drawImage(person, 0, 0);
    }
    if (st.captions && plan.cues.length) drawCaptions(g, W, H, u, plan, tSrc);
    if (layers.length) drawLayers(g, W, H, u, plan, tOut, opt, back ? 'front' : 'all');
    if (opt.selected) drawSelection(g, u, opt);
    drawOverlays(g, W, H, u, plan, tOut, still);
    if (tr && (tr.k === 'fade' || tr.k === 'flash')) {
      g.fillStyle = tr.k === 'fade' ? 'rgba(0,0,0,' + RS.clamp(tr.a, 0, 1) + ')' : 'rgba(255,255,255,' + RS.clamp(Math.pow(tr.a, 1.4) * 0.95, 0, 1) + ')';
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  };

  /* ------------------------------------------------------------------ transitions
     intro (first transLen s), outro (last transLen s) and cuts (centred on each join). a = strength 0..1,
     dir = -1 on the way out of a shot, +1 on the way in. Fade and flash are drawn over everything at the end;
     the others move the picture (copied to a scratch canvas) before captions and stickers go on top. */
  function transAt(plan, t) {
    var st = plan.st, L = st.transLen || 0.4, D = plan.outDur;
    if (st.transIn && st.transIn !== 'none' && t < L && !wallOn(plan, 0)) return { k: st.transIn, a: 1 - t / L, dir: 1 };
    if (st.transOut && st.transOut !== 'none' && D - t < L) return { k: st.transOut, a: 1 - (D - t) / L, dir: -1 };
    if (st.transCut && st.transCut !== 'none' && plan.joins) {
      for (var i = 0; i < plan.joins.length; i++) {
        var d = t - plan.joins[i];
        if (Math.abs(d) < L / 2) return { k: st.transCut, a: 1 - Math.abs(d) / (L / 2), dir: d < 0 ? -1 : 1 };
      }
    }
    return null;
  }
  RS.transAt = transAt;
  var snap = document.createElement('canvas'), tiny = document.createElement('canvas'), wipeCv = document.createElement('canvas'), gradeCv = document.createElement('canvas');

  /* ------------------------------------------------------------------ colour grades (style.grade, strength gradeAmt)
     Canvas blend modes only, so it's fast and works in every browser: multiply pulls the highlights down, screen lifts
     the blacks, "saturation" with grey takes colour out (with a pure colour it adds colour), soft-light tints, and
     soft-light of the picture onto itself adds contrast. r = the rectangle to grade. */
  RS.grade = function (g, k, amt, r) {
    var a = RS.clamp(amt == null ? 0.75 : amt, 0, 1);
    if (!k || k === 'none' || !a) return;
    var x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    function fill(op, color, alpha) { g.globalCompositeOperation = op; g.globalAlpha = RS.clamp(alpha * a, 0, 1); g.fillStyle = color; g.fillRect(x, y, w, h); }
    function contrast(alpha) {
      if (gradeCv.width !== w || gradeCv.height !== h) { gradeCv.width = w; gradeCv.height = h; }
      var cg = gradeCv.getContext('2d'); cg.globalCompositeOperation = 'copy'; cg.drawImage(g.canvas, x, y, w, h, 0, 0, w, h);
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = RS.clamp(alpha * a, 0, 1); g.drawImage(gradeCv, x, y);
    }
    function vignette(strength) {
      var cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2, gr = g.createRadialGradient(cx, cy, R * 0.38, cx, cy, R);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    if (k === 'warm') { fill('soft-light', '#FF8A2B', 0.6); fill('multiply', '#FFEAD4', 0.7); fill('screen', '#241200', 0.6); }
    else if (k === 'moody') { fill('multiply', '#CFCFD6', 1); fill('screen', '#1C1C22', 1); fill('saturation', '#808080', 0.2); vignette(0.6); }  // highlights down, blacks up, saturation -15-20%, soft vignette
    else if (k === 'cool') { fill('soft-light', '#2F7DFF', 0.5); fill('saturation', '#808080', 0.1); fill('screen', '#000C1A', 0.6); }
    else if (k === 'teal') { fill('soft-light', '#00897B', 0.45); fill('overlay', '#FF8C42', 0.2); contrast(0.3); fill('saturation', '#FF0000', 0.1); }
    else if (k === 'vivid') { contrast(0.55); fill('saturation', '#FF0000', 0.22); }
    else if (k === 'film') { fill('screen', '#2A2218', 1); fill('multiply', '#F4E6D2', 1); fill('saturation', '#808080', 0.28); vignette(0.38); }
    else if (k === 'bw') { fill('saturation', '#808080', 1); contrast(0.45); }
    g.restore();
  };
  /* A small preview of a grade on the current frame (the editor's colour picker). */
  RS.gradeThumb = function (cv, src, k, amt, st) {
    cv.width = 108; cv.height = 144;
    var g = cv.getContext('2d'), sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, 108, 144);
    if (sw && sh) cover(g, src, sw, sh, 0, 0, 108, 144, (st && st.zoom) || 1, st ? st.fx : 0.5, st ? st.fy : 0.5);
    RS.grade(g, k, amt, { x: 0, y: 0, w: 108, h: 144 });
  };
  function wipeAt(t) { return t < 0.4 ? 0 : t > 1.9 ? 1 : ease((t - 0.4) / 1.5); }

  /* ------------------------------------------------------------------ picture in picture (layout 'pip')
     The main shot fills the frame; a rounded card in a corner shows a second crop of the same video (zoom2/fx2/fy2),
     or another video from this device (plan.pipSrc: a reaction or a face cam, played along with the reel). */
  RS.pipRect = function (st, W, H) {
    var u = Math.min(W, H) / 1080, w = W * (st.pipSize || 0.38), h = Math.min(H * 0.6, w * 1.4), m = 40 * u;
    var right = st.pipPos === 'tr' || st.pipPos === 'br', bottom = st.pipPos === 'bl' || st.pipPos === 'br';
    return { x: right ? W - w - m : m, y: bottom ? H - h - m - 40 * u : m + 80 * u, w: w, h: h };
  };
  function drawPip(g, W, H, u, src, sw, sh, plan) {
    var st = plan.st, r = RS.pipRect(st, W, H), pv = plan.pipSrc && plan.pipSrc.readyState >= 2 && plan.pipSrc.videoWidth ? plan.pipSrc : null;
    var s2 = pv || src, w2 = pv ? pv.videoWidth : sw, h2 = pv ? pv.videoHeight : sh;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 34 * u; g.shadowOffsetY = 10 * u; g.fillStyle = '#000'; rr(g, r.x, r.y, r.w, r.h, 30 * u); g.fill();
    g.restore(); g.save();
    rr(g, r.x, r.y, r.w, r.h, 30 * u); g.clip(); cover(g, s2, w2, h2, r.x, r.y, r.w, r.h, st.zoom2, st.fx2, st.fy2);
    g.restore();
    g.lineWidth = 5 * u; g.strokeStyle = 'rgba(255,255,255,.92)'; rr(g, r.x, r.y, r.w, r.h, 30 * u); g.stroke();
  }

  /* ------------------------------------------------------------------ the 3×3 wall intro (style.wall)
     The shot shrinks into the centre tile of a 3×3 grid, 8 other moments (plan.wall: frames from the project's other
     clips) pop in around it one after another, then the camera pushes back into the centre. Replaces the intro. */
  var WALL_D = 1.9;
  RS.WALL_D = WALL_D;
  function wallOn(plan, t) { return !!(plan.st.wall && plan.wall && plan.wall.length && t < WALL_D); }
  function drawWall(g, W, H, u, plan, t) {
    if (snap.width !== W || snap.height !== H) { snap.width = W; snap.height = H; }
    var sg = snap.getContext('2d'); sg.clearRect(0, 0, W, H); sg.drawImage(g.canvas, 0, 0);
    var st = plan.st, gap = 14 * u, tw = (W - gap * 4) / 3, th = (H - gap * 4) / 3, full = W / tw;
    var k = t < 0.35 ? full + (1 - full) * ease(t / 0.35) : t < 1.35 ? 1 : 1 + (full - 1) * Math.pow(RS.clamp((t - 1.35) / 0.55, 0, 1), 2.2);
    var cx = gap * 2 + tw * 1.5, cy = gap * 2 + th * 1.5, order = [0, 1, 2, 5, 8, 7, 6, 3];
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = INK; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.scale(k, k); g.translate(-cx, -cy);
    for (var i = 0; i < 9; i++) {
      var x = gap + (i % 3) * (tw + gap), y = gap + Math.floor(i / 3) * (th + gap);
      if (i === 4) { g.save(); rr(g, x, y, tw, th, 18 * u); g.clip(); g.drawImage(snap, x, y, tw, th); g.restore(); continue; }
      var pos = order.indexOf(i), p = (t - 0.35 - pos * 0.075) / 0.28;
      if (p <= 0) continue;
      var fr = plan.wall[pos % plan.wall.length], sc = Math.max(0.01, popIn(p));
      g.save(); g.translate(x + tw / 2, y + th / 2); g.scale(sc, sc); g.translate(-tw / 2, -th / 2);
      rr(g, 0, 0, tw, th, 18 * u); g.clip(); cover(g, fr, fr.width, fr.height, 0, 0, tw, th, 1, st.fx, st.fy);
      g.restore();
    }
    g.restore();
  }
  /* Frames for the wall: one picture per time, read from a separate <video> so the preview isn't disturbed. */
  var wallCache = {};
  RS.wallFrames = function (m, times) {
    var key = m.url + '|' + times.map(function (t) { return t.toFixed(1); }).join(',');
    if (wallCache[key]) return wallCache[key];
    var p = RS.videoEl(m.url).then(function (v) {
      var out = [];
      return times.reduce(function (pr, t) {
        return pr.then(function () { return RS.seek(v, t); }).then(function () {
          var c = document.createElement('canvas'), w = 360; c.width = w; c.height = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.push(c);
        });
      }, Promise.resolve()).then(function () { v.removeAttribute('src'); v.load(); return out; });
    });
    wallCache[key] = p; p.catch(function () { delete wallCache[key]; });
    return p;
  };

  /* ------------------------------------------------------------------ the person cut-out (layers with behind: true)
     Google's MediaPipe selfie segmenter, loaded from a CDN the first time someone puts text behind a person, runs
     on this device (nothing is uploaded). cutout() returns a copy of the frame with only the person left. */
  RS.person = (function () {
    var self = { ready: false, failed: false }, seg = null, loading = null, lastTs = 0, cacheKey = null;
    var BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    var MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
    var small = document.createElement('canvas'), maskCv = document.createElement('canvas'), out = document.createElement('canvas');
    self.load = function () {
      if (seg) return Promise.resolve(true);
      if (loading) return loading;
      loading = import(BASE + '/vision_bundle.mjs').then(function (V) {
        return V.FilesetResolver.forVisionTasks(BASE + '/wasm').then(function (files) {
          function make(delegate) {
            return V.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: delegate }, runningMode: 'VIDEO',
              outputCategoryMask: false, outputConfidenceMasks: true });
          }
          return make('GPU').catch(function () { return make('CPU'); });
        });
      }).then(function (s) { seg = s; self.ready = true; self.failed = false; return true; }, function (e) {
        console.warn('person cut-out', e); self.failed = true; loading = null;
        throw new Error('The person cut-out couldn\'t load. Check your connection and try again.');
      });
      return loading;
    };
    self.cutout = function (srcCanvas, W, H, key) {
      if (!seg) return null;
      if (out.width !== W || out.height !== H) { out.width = W; out.height = H; cacheKey = null; }
      if (key !== cacheKey) {
        var mw = 256, mh = Math.max(16, Math.round(256 * H / W)), ok = false;
        if (small.width !== mw || small.height !== mh) { small.width = mw; small.height = mh; }
        small.getContext('2d').drawImage(srcCanvas, 0, 0, W, H, 0, 0, mw, mh);
        lastTs = Math.max(lastTs + 1, performance.now());
        try {
          seg.segmentForVideo(small, lastTs, function (res) {
            var masks = res.confidenceMasks || [], m = masks[masks.length - 1];
            if (!m) return;
            var w = m.width, h = m.height, f = m.getAsFloat32Array();
            if (maskCv.width !== w || maskCv.height !== h) { maskCv.width = w; maskCv.height = h; }
            var mg = maskCv.getContext('2d'), id = mg.createImageData(w, h), d = id.data;
            for (var i = 0, j = 0; i < f.length; i++, j += 4) { var a = (f[i] - 0.3) / 0.4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255; }
            mg.putImageData(id, 0, 0); ok = true;
          });
        } catch (e) { console.warn('cut-out', e); }
        if (!ok) return null;
        cacheKey = key;
      }
      var og = out.getContext('2d');
      og.globalCompositeOperation = 'copy'; og.drawImage(srcCanvas, 0, 0, W, H, 0, 0, W, H);
      og.globalCompositeOperation = 'destination-in'; og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
      og.drawImage(maskCv, 0, 0, W, H);
      og.globalCompositeOperation = 'source-over';
      return out;
    };
    return self;
  })();
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function moveFrame(g, W, H, u, tr, t) {
    var k = tr.k, a = RS.clamp(tr.a, 0, 1), a2 = a * a;
    if (k === 'fade' || k === 'flash' || k === 'none') return;
    if (snap.width !== W || snap.height !== H) { snap.width = W; snap.height = H; }
    var sg = snap.getContext('2d'); sg.clearRect(0, 0, W, H); sg.drawImage(g.canvas, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (k === 'zoom') {
      var z = 1 + 0.7 * a2; g.translate(W / 2, H / 2); g.scale(z, z); g.drawImage(snap, -W / 2, -H / 2);
    } else if (k === 'spin') {
      g.translate(W / 2, H / 2); g.rotate(-tr.dir * a2 * Math.PI * 0.55); var zs = 1 + a * 0.9; g.scale(zs, zs); g.drawImage(snap, -W / 2, -H / 2);
    } else if (k === 'whip') {
      var x = (tr.dir > 0 ? 1 : -1) * a2 * W * 0.95;
      for (var i = 4; i >= 1; i--) { g.globalAlpha = 0.2; g.drawImage(snap, x - (tr.dir > 0 ? 1 : -1) * i * W * 0.07 * a, 0); }
      g.globalAlpha = 0.75; g.drawImage(snap, x, 0); g.globalAlpha = 1;
    } else if (k === 'shake') {
      var amp = 46 * u * a, zz = 1 + 0.1 * a;
      g.translate(W / 2 + Math.sin(t * 93) * amp, H / 2 + Math.cos(t * 71) * amp * 0.7); g.rotate(Math.sin(t * 57) * 0.04 * a); g.scale(zz, zz); g.drawImage(snap, -W / 2, -H / 2);
    } else if (k === 'glitch') {
      g.drawImage(snap, 0, 0);
      var seed = Math.floor(t * 24), y = 0;
      for (var b = 0; y < H && b < 14; b++) {
        var h = H * (0.03 + rnd(seed + b) * 0.1), dx = (rnd(seed * 3 + b) - 0.5) * W * 0.35 * a;
        if (rnd(seed + b * 7) < 0.6) g.drawImage(snap, 0, y, W, h, dx, y, W, h);
        y += h;
      }
      g.globalCompositeOperation = 'screen';
      for (var c = 0; c < 4; c++) {
        var cy = rnd(seed + c * 13) * H, ch = H * (0.02 + rnd(seed + c) * 0.06);
        g.fillStyle = c % 2 ? 'rgba(0,255,230,' + 0.45 * a + ')' : 'rgba(255,40,150,' + 0.45 * a + ')'; g.fillRect(0, cy, W, ch);
      }
      g.globalCompositeOperation = 'source-over';
    } else if (k === 'pixel') {
      var blk = Math.max(1, (6 + 70 * a2) * u), tw = Math.max(1, Math.round(W / blk)), th = Math.max(1, Math.round(H / blk));
      if (tiny.width !== tw || tiny.height !== th) { tiny.width = tw; tiny.height = th; }
      var tg = tiny.getContext('2d'); tg.imageSmoothingEnabled = true; tg.drawImage(snap, 0, 0, tw, th);
      g.imageSmoothingEnabled = false; g.drawImage(tiny, 0, 0, W, H); g.imageSmoothingEnabled = true;
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ text + stickers (style.layers)
     Each layer: {id, t: text|emoji|badge|shape, v, x, y (0..1 of the frame), size, rot (deg), s, e (reel seconds) or all,
     anim (entrance), loop (idle motion), font, ts (text style), fill, line, shape (badge), upper}.
     opt.boxes (array) collects hit boxes for the editor; opt.selected draws a dashed box + the scale/rotate handle. */
  function bounceOut(x) {
    x = RS.clamp(x, 0, 1); var n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375;
  }
  /* When a layer shows, in reel seconds. A layer pinned to a word (at = the word's second in the source video) follows
     that word when the clip is trimmed, sped up or has its silences cut; it hides if the word is trimmed away. */
  function layerSpan(L, plan) {
    if (L.all) return [0, 1e9];
    var s = L.s || 0, e = L.e || 0;
    if (L.at != null && plan.clip && plan.segs) {
      if (L.at < plan.clip.start - 0.01 || L.at > plan.clip.end) return [-1, -1];
      var len = Math.max(0.3, e - s); s = RS.srcToOut(plan, L.at); e = s + len;
    }
    return [s, e];
  }
  function inSpan(sp, t) { return t >= sp[0] && t < sp[1]; }
  RS.layerSpan = layerSpan;
  function drawSelection(g, u, opt) {
    var b = (opt.boxes || []).filter(function (x) { return x.id === opt.selected; })[0];
    if (!b) return;
    var bw = b.w, bh = b.h, pad = 14 * u;
    g.save(); g.translate(b.x, b.y); g.rotate(b.rot);
    g.setLineDash([14 * u, 10 * u]); g.lineWidth = 4 * u; g.strokeStyle = '#FFFFFF'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6 * u;
    g.strokeRect(-bw / 2 - pad, -bh / 2 - pad, bw + pad * 2, bh + pad * 2); g.setLineDash([]);
    g.fillStyle = '#C6F432'; g.strokeStyle = INK; g.lineWidth = 5 * u; g.beginPath(); g.arc(bw / 2 + pad, bh / 2 + pad, 24 * u, 0, 7); g.fill(); g.stroke();
    g.shadowBlur = 0; g.fillStyle = INK; g.font = '700 ' + Math.round(28 * u) + 'px "DM Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('↻', bw / 2 + pad, bh / 2 + pad + 1 * u);
    g.restore();
  }
  /* which: 'all', 'behind' (only layers behind the person) or 'front' (the rest). */
  function drawLayers(g, W, H, u, plan, t, opt, which) {
    var still = !!opt.noFade;
    plan.st.layers.forEach(function (L) {
      if (which === 'behind' && !L.behind) return;
      if (which === 'front' && L.behind) return;
      var sp = layerSpan(L, plan), s = sp[0], e = sp[1];
      var vis = t >= s && t < e, sel = opt.selected === L.id, ghost = !vis && sel;
      if (!vis && !ghost) return;
      var local = Math.max(0, t - s), calm = still || ghost;
      var x = L.x * W, y = L.y * H, sc = L.size || 1, rot = (L.rot || 0) * Math.PI / 180, alpha = ghost ? 0.45 : 1, chars = null;
      if (!calm) {
        var an = L.anim || 'none';
        if (an === 'pop') sc *= Math.max(0.01, popIn(local / 0.4));
        else if (an === 'fade') alpha *= ease(local / 0.4);
        else if (an === 'slide') { y += (1 - ease(local / 0.45)) * H * 0.12; alpha *= ease(local / 0.3); }
        else if (an === 'drop') y -= (1 - bounceOut(local / 0.7)) * H * 0.3;
        else if (an === 'zoom') { sc *= 1 + 1.6 * (1 - ease(local / 0.4)); alpha *= ease(local / 0.25); }
        else if (an === 'spin') { rot -= (1 - ease(local / 0.5)) * Math.PI * 1.5; sc *= Math.max(0.01, ease(local / 0.5)); }
        else if (an === 'type') { if (L.t === 'text' || L.t === 'card') chars = Math.floor(local / (L.t === 'card' ? 0.035 : 0.05)) + 1; else sc *= Math.max(0.01, popIn(local / 0.4)); }
        var lp = L.loop || 'none';
        if (lp === 'wiggle') rot += Math.sin(local * 6) * 0.08;
        else if (lp === 'float') y += Math.sin(local * 2.4) * 14 * u;
        else if (lp === 'pulse') sc *= 1 + Math.sin(local * 5) * 0.06;
        else if (lp === 'shake') { x += Math.sin(local * 47) * 6 * u; y += Math.cos(local * 53) * 5 * u; }
        else if (lp === 'spin') rot += local * 1.6;
        if (!L.all && e - t < 0.25) alpha *= RS.clamp((e - t) / 0.25, 0, 1);
      }
      g.save(); g.globalAlpha = RS.clamp(alpha, 0, 1); g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
      var box = drawLayerBody(g, L, u, W, chars, calm ? 99 : local);
      g.restore();
      var bw = box.w * (L.size || 1), bh = box.h * (L.size || 1), br = (L.rot || 0) * Math.PI / 180;
      if (opt.boxes) opt.boxes.push({ id: L.id, x: L.x * W, y: L.y * H, w: bw, h: bh, rot: br });
    });
  }
  function wrapLines(g, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), cur = '';
      if (!words.length) { out.push(''); return; }
      words.forEach(function (w) { var tryL = cur ? cur + ' ' + w : w; if (cur && g.measureText(tryL).width > maxW) { out.push(cur); cur = w; } else cur = tryL; });
      out.push(cur);
    });
    return out.slice(0, 5);
  }
  function drawLayerBody(g, L, u, W, chars, lt) {
    if (L.t === 'emoji') return drawEmoji(g, L.v, u);
    if (L.t === 'badge') return drawBadge(g, L, u);
    if (L.t === 'shape') return drawShape(g, L, u);
    if (L.t === 'card') return drawCard(g, L, u, chars, lt == null ? 99 : lt);
    var fname = L.font || 'Anton', fs = 92 * u * (RS.FONT_SCALE[fname] || 1), ts = L.ts || 'outline';
    g.font = font(fname, fs); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
    var txt = L.upper ? String(L.v).toUpperCase() : String(L.v);
    var lines = wrapLines(g, txt, W * 0.86 / Math.max(0.6, L.size || 1)), full = lines.slice();
    if (chars != null) { var left = chars; lines = lines.map(function (l) { var part = l.slice(0, Math.max(0, left)); left -= l.length + 1; return part; }); }
    var lh = fs * (fname === 'Pacifico' ? 1.45 : 1.14), bw = Math.max.apply(null, full.map(function (l) { return g.measureText(l).width; }).concat([fs])), bh = lines.length * lh;
    var y0 = -bh / 2 + lh / 2, fill = L.fill || '#FFFFFF', line = L.line || '#000000';
    if (ts === 'sticker') {
      var px = fs * 0.5, py = fs * 0.26;
      g.fillStyle = INK; rr(g, -bw / 2 - px + 10 * u, -bh / 2 - py + 10 * u, bw + px * 2, bh + py * 2, 26 * u); g.fill();
      g.fillStyle = line; rr(g, -bw / 2 - px, -bh / 2 - py, bw + px * 2, bh + py * 2, 26 * u); g.fill(); g.lineWidth = 6 * u; g.strokeStyle = INK; g.stroke();
    }
    lines.forEach(function (l, i) {
      var y = y0 + i * lh;
      if (ts === 'marker' && l) {
        var mw = g.measureText(full[i]).width;
        g.save(); g.rotate(-0.02); g.fillStyle = line; g.globalAlpha *= 0.92;
        g.beginPath(); g.moveTo(-mw / 2 - fs * 0.22, y - lh * 0.3); g.lineTo(mw / 2 + fs * 0.3, y - lh * 0.36); g.lineTo(mw / 2 + fs * 0.2, y + lh * 0.34); g.lineTo(-mw / 2 - fs * 0.3, y + lh * 0.3); g.closePath(); g.fill();
        g.restore();
      }
      if (ts === 'outline') { g.lineWidth = fs * 0.17; g.strokeStyle = line; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y); }
      else if (ts === 'double') { g.lineWidth = fs * 0.4; g.strokeStyle = line; g.strokeText(l, 0, y); g.lineWidth = fs * 0.17; g.strokeStyle = INK; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y); }
      else if (ts === 'pop3d') {
        var depth = fs * 0.1, step = Math.max(1, 1.5 * u);
        g.fillStyle = line; g.strokeStyle = line; g.lineWidth = fs * 0.08;
        for (var d = depth; d > 0; d -= step) { g.strokeText(l, d, y + d); g.fillText(l, d, y + d); }
        g.strokeStyle = INK; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y);
      } else if (ts === 'hollow') {
        g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10 * u; g.lineWidth = fs * 0.075; g.strokeStyle = line; g.strokeText(l, 0, y); g.restore();
        g.lineWidth = fs * 0.075; g.strokeStyle = line; g.strokeText(l, 0, y);
      } else if (ts === 'glow') {
        g.save(); g.shadowColor = line; g.shadowBlur = 36 * u; g.fillStyle = fill; g.fillText(l, 0, y); g.fillText(l, 0, y); g.restore();
        g.lineWidth = fs * 0.035; g.strokeStyle = line; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y);
      } else if (ts === 'plain') {
        g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16 * u; g.shadowOffsetY = 4 * u; g.fillStyle = fill; g.fillText(l, 0, y); g.restore();
      } else if (ts === 'magazine') {
        g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18 * u; g.shadowOffsetY = 3 * u; g.fillStyle = fill; g.fillText(l, 0, y); g.restore();
      } else { g.fillStyle = fill; g.fillText(l, 0, y); }
    });
    if (ts === 'magazine') {
      // a magazine masthead: issue line above, a thin rule and a barcode below
      var kfs = Math.max(14 * u, fs * 0.17), kick = String(L.sub || magKicker()).toUpperCase();
      g.save(); g.fillStyle = fill; g.globalAlpha *= 0.9;
      g.font = '700 ' + Math.round(kfs) + 'px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(kick, 0, -bh / 2 - kfs * 0.9);
      g.fillRect(-bw / 2, bh / 2 + kfs * 0.4, bw, Math.max(1, 2 * u));
      var bx = bw / 2 - kfs * 6, by = bh / 2 + kfs * 1.0;
      for (var i = 0; i < 28; i++) { var bwid = (rndBar(i) * 2.4 + 0.8) * u * 1.6; g.fillRect(bx + i * kfs * 0.21, by, bwid, kfs * 2); }
      g.restore();
      return { w: bw + fs * 0.2, h: bh + kfs * 6 };
    }
    var extra = ts === 'sticker' ? fs * 1.0 : ts === 'double' ? fs * 0.4 : fs * 0.2;
    return { w: bw + extra, h: bh + (ts === 'sticker' ? fs * 0.52 : fs * 0.1) };
  }
  function rndBar(i) { var x = Math.sin(i * 91.7 + 13.1) * 43758.5; return x - Math.floor(x); }
  function magKicker() {
    var d = new Date(), m = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'][d.getMonth()];
    return 'No. 01 · ' + m + ' ' + d.getFullYear() + ' · The reel issue';
  }

  /* Cards: 'label' (an app-icon tile + a name, like a tool label), 'repo' (a GitHub-style repo card) and 'prompt'
     (a chat prompt bar; with the "type" entrance it types itself out, then the cursor blinks). fill = accent colour. */
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function sans(weight, size) { return weight + ' ' + Math.round(size) + 'px "DM Sans", system-ui, sans-serif'; }
  function drawCard(g, L, u, chars, lt) {
    var kind = L.card || 'label', acc = L.fill || '#22C55E', title = String(L.v || ''), sub = String(L.sub || '');
    var shown = chars != null ? title.slice(0, Math.max(0, chars)) : title;
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    function shadowed(fn) { g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 28 * u; g.shadowOffsetY = 8 * u; fn(); g.restore(); }
    if (kind === 'label') {
      var fs = 84 * u, tile = 132 * u, gap = 28 * u;
      g.font = sans(700, fs);
      var tw = g.measureText(title).width, w = tile + gap + tw, x0 = -w / 2;
      shadowed(function () { g.fillStyle = '#121216'; rr(g, x0, -tile / 2, tile, tile, 32 * u); g.fill(); });
      g.fillStyle = acc; rr(g, x0 + 16 * u, -tile / 2 + 16 * u, tile - 32 * u, tile - 32 * u, 20 * u); g.fill();
      g.font = Math.round(tile * 0.46) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.fillText(L.icon || '🧰', x0 + tile / 2, 4 * u);
      g.font = sans(700, fs); g.textAlign = 'left';
      g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18 * u; g.shadowOffsetY = 4 * u; g.fillStyle = '#FFFFFF'; g.fillText(shown, x0 + tile + gap, 4 * u); g.restore();
      return { w: w + 24 * u, h: tile + 24 * u };
    }
    if (kind === 'repo') {
      var cw = 860 * u, pad = 34 * u, fsT = 44 * u, fsS = 30 * u;
      g.font = sans(400, fsS);
      var dl = sub ? wrapLines(g, sub, cw - pad * 2).slice(0, 2) : [];
      var ch = pad * 2 + fsT * 1.2 + (dl.length ? dl.length * fsS * 1.4 + 16 * u : 0) + 72 * u, cx0 = -cw / 2, cy0 = -ch / 2;
      shadowed(function () { g.fillStyle = '#0D1117'; rr(g, cx0, cy0, cw, ch, 26 * u); g.fill(); });
      g.lineWidth = 3 * u; g.strokeStyle = '#30363D'; rr(g, cx0, cy0, cw, ch, 26 * u); g.stroke();
      var y = cy0 + pad + fsT * 0.6;
      g.textAlign = 'left'; g.font = Math.round(fsT * 0.85) + 'px ' + EMOJI_FONT; g.fillText(L.icon || '📦', cx0 + pad, y);
      var tx = cx0 + pad + fsT * 1.3;
      g.font = sans(700, fsT); g.fillStyle = '#E6EDF3'; g.fillText(shown, tx, y);
      var ttw = g.measureText(title).width; g.font = sans(600, 24 * u);
      var pw = g.measureText('Public').width + 30 * u;
      if (tx + ttw + 22 * u + pw < cx0 + cw - pad) { g.strokeStyle = '#30363D'; rr(g, tx + ttw + 22 * u, y - 21 * u, pw, 42 * u, 21 * u); g.stroke(); g.fillStyle = '#8B949E'; g.fillText('Public', tx + ttw + 37 * u, y + 1 * u); }
      y += fsT * 0.6 + 16 * u;
      g.font = sans(400, fsS); g.fillStyle = '#8B949E';
      dl.forEach(function (l) { y += fsS * 0.7; g.fillText(l, cx0 + pad, y); y += fsS * 0.7; });
      var bx = cx0 + pad, by = cy0 + ch - pad - 24 * u;
      g.font = sans(600, 26 * u);
      [['☆', 'Star', acc], ['⑂', 'Fork', '#8B949E']].forEach(function (b) {
        var label = b[0] + '  ' + b[1], bw2 = g.measureText(label).width + 36 * u;
        g.fillStyle = '#21262D'; rr(g, bx, by - 25 * u, bw2, 50 * u, 12 * u); g.fill(); g.strokeStyle = '#30363D'; g.stroke();
        g.fillStyle = '#C9D1D9'; g.fillText(label, bx + 18 * u, by + 1 * u); bx += bw2 + 14 * u;
      });
      return { w: cw, h: ch };
    }
    // the prompt bar
    var pwid = 880 * u, pp = 32 * u, pfs = 40 * u, btn = 66 * u, lab = sub ? 30 * u : 0;
    g.font = sans(500, pfs);
    var lines = wrapLines(g, title, pwid - pp * 2 - btn - 18 * u).slice(0, 3), shownL = lines;
    if (chars != null) { var left = chars; shownL = lines.map(function (l) { var part = l.slice(0, Math.max(0, left)); left -= l.length + 1; return part; }); }
    var ph = Math.max(btn + pp * 1.2, lines.length * pfs * 1.38 + pp * 1.6) + lab, px0 = -pwid / 2, py0 = -ph / 2;
    shadowed(function () { g.fillStyle = '#2A2724'; rr(g, px0, py0, pwid, ph, 34 * u); g.fill(); });
    g.lineWidth = 2.5 * u; g.strokeStyle = 'rgba(255,255,255,.14)'; rr(g, px0, py0, pwid, ph, 34 * u); g.stroke();
    g.textAlign = 'left';
    if (sub) { g.font = sans(700, 20 * u); g.fillStyle = '#9A948A'; g.fillText(sub.toUpperCase().slice(0, 40), px0 + pp, py0 + pp * 0.9); }
    g.font = sans(500, pfs); g.fillStyle = '#F5F1EA';
    var ty0 = py0 + lab + pp * 0.8 + pfs * 0.69, lastX = px0 + pp, lastY = ty0, typing = chars != null && chars < title.length;
    shownL.forEach(function (l, i) { var yy = ty0 + i * pfs * 1.38; g.fillText(l, px0 + pp, yy); if (l.length || i === 0) { lastX = px0 + pp + g.measureText(l).width; lastY = yy; } });
    if (typing || Math.floor(lt * 2) % 2 === 0) { g.fillStyle = acc; g.fillRect(lastX + 4 * u, lastY - pfs * 0.55, 4 * u, pfs * 1.1); }
    var bcx = px0 + pwid - pp - btn / 2 + 8 * u, bcy = py0 + ph - pp * 0.6 - btn / 2;
    g.fillStyle = acc; g.beginPath(); g.arc(bcx, bcy, btn / 2, 0, 7); g.fill();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 6 * u; g.lineCap = 'round';
    g.beginPath(); g.moveTo(bcx, bcy + 15 * u); g.lineTo(bcx, bcy - 15 * u); g.moveTo(bcx - 12 * u, bcy - 3 * u); g.lineTo(bcx, bcy - 15 * u); g.lineTo(bcx + 12 * u, bcy - 3 * u); g.stroke();
    return { w: pwid, h: ph };
  }

  /* A layer drawn on its own, fitted into a small canvas (the editor's style and sticker pickers). */
  var measureCtx = document.createElement('canvas').getContext('2d');
  RS.layerThumb = function (cv, L, w, h, bg) {
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    g.fillStyle = bg || '#2A1F45'; g.fillRect(0, 0, w, h);
    var box = drawLayerBody(measureCtx, L, 1, 1080, null), k = Math.min(w * 0.84 / box.w, h * 0.8 / box.h);
    g.save(); g.translate(w / 2, h / 2); g.scale(k, k); g.rotate((L.rot || 0) * Math.PI / 180); drawLayerBody(g, L, 1, 1080, null); g.restore();
  };

  var emojiCache = {};
  function drawEmoji(g, em, u) {
    var px = Math.max(16, Math.round(150 * u / 4) * 4), key = em + '|' + px, c = emojiCache[key];
    if (!c) {
      var S = Math.round(px * 1.7), r = px * 0.075, sh = px * 0.05;
      var base = document.createElement('canvas'); base.width = base.height = S;
      var bg = base.getContext('2d'); bg.font = px + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText(em, S / 2, S / 2 + px * 0.06);
      function sil(color) { var k = document.createElement('canvas'); k.width = k.height = S; var kg = k.getContext('2d'); kg.drawImage(base, 0, 0); kg.globalCompositeOperation = 'source-in'; kg.fillStyle = color; kg.fillRect(0, 0, S, S); return k; }
      var white = sil('#FFFFFF'), ink = sil(INK);
      c = document.createElement('canvas'); c.width = c.height = S; var cg = c.getContext('2d');
      for (var i = 0; i < 16; i++) { var an = i / 16 * Math.PI * 2; cg.drawImage(ink, Math.cos(an) * r + sh, Math.sin(an) * r + sh); }
      for (var j = 0; j < 16; j++) { var aj = j / 16 * Math.PI * 2; cg.drawImage(white, Math.cos(aj) * r, Math.sin(aj) * r); }
      cg.drawImage(base, 0, 0);
      emojiCache[key] = c;
    }
    g.drawImage(c, -c.width / 2, -c.height / 2);
    return { w: px * 1.25, h: px * 1.25 };
  }
  function drawBadge(g, L, u) {
    var fs = 62 * u, fill = L.fill || '#FFE14D', txt = String(L.v).toUpperCase().slice(0, 24);
    g.font = font('Luckiest Guy', fs); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    var tw = g.measureText(txt).width, w, h, sh = 9 * u;
    function path(dx) {
      g.beginPath();
      if (L.shape === 'circle') { var R = Math.max(tw / 2 + fs * 0.55, fs * 1.15); g.arc(dx, dx, R, 0, 7); w = h = R * 2; }
      else if (L.shape === 'burst') {
        var rx = tw / 2 + fs * 1.0, ry = fs * 1.35, n = 18;
        for (var i = 0; i <= n * 2; i++) { var a = i / (n * 2) * Math.PI * 2, k = i % 2 ? 0.78 : 1; g.lineTo(dx + Math.cos(a) * rx * k, dx + Math.sin(a) * ry * k); }
        g.closePath(); w = rx * 2; h = ry * 2;
      } else if (L.shape === 'bubble') {
        w = tw + fs * 1.1; h = fs * 1.6; var r = 30 * u, x0 = -w / 2 + dx, y0 = -h / 2 + dx;
        g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
        g.lineTo(x0 + w * 0.34, y0 + h); g.lineTo(x0 + w * 0.16, y0 + h + fs * 0.6); g.lineTo(x0 + w * 0.2, y0 + h);
        g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath(); h += fs * 0.6;
      } else { w = tw + fs * 1.0; h = fs * 1.5; rr(g, -w / 2 + dx, -h / 2 + dx, w, h, h / 2); }
    }
    path(sh); g.fillStyle = INK; g.fill();
    path(0); g.fillStyle = fill; g.fill(); g.lineWidth = 6 * u; g.strokeStyle = INK; g.stroke();
    if (L.shape === 'circle') { g.setLineDash([10 * u, 9 * u]); g.lineWidth = 3 * u; g.beginPath(); g.arc(0, 0, w / 2 - 12 * u, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = inkOn(fill); g.fillText(txt, 0, fs * 0.08);
    return { w: w + sh, h: h + sh };
  }
  function drawShape(g, L, u) {
    var c = L.fill || '#FF3D8B', k = u;
    function both(width, fn) { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = width + 14 * k; fn(); g.stroke(); g.strokeStyle = c; g.lineWidth = width; fn(); g.stroke(); }
    function filled(fn) { g.save(); g.translate(8 * k, 8 * k); fn(); g.fillStyle = INK; g.fill(); g.restore(); fn(); g.fillStyle = c; g.fill(); g.lineWidth = 7 * k; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); }
    if (L.v === 'arrow') {
      both(26 * k, function () { g.beginPath(); g.moveTo(-130 * k, 40 * k); g.quadraticCurveTo(-20 * k, -60 * k, 95 * k, -8 * k); });
      filled(function () { g.beginPath(); g.moveTo(140 * k, 8 * k); g.lineTo(70 * k, -50 * k); g.lineTo(78 * k, 40 * k); g.closePath(); });
      return { w: 300 * k, h: 150 * k };
    }
    if (L.v === 'ring') {
      both(14 * k, function () { g.beginPath(); for (var i = 0; i <= 64; i++) { var a = 0.3 + i / 64 * Math.PI * 2.15, r = 1 + 0.05 * Math.sin(i * 0.7); g.lineTo(Math.cos(a) * 160 * k * r, Math.sin(a) * 100 * k * r); } });
      return { w: 350 * k, h: 230 * k };
    }
    if (L.v === 'underline') {
      both(16 * k, function () { g.beginPath(); for (var i = 0; i <= 40; i++) { var x = -150 * k + i * 7.5 * k; g.lineTo(x, Math.sin(i * 0.55) * 14 * k); } });
      return { w: 330 * k, h: 70 * k };
    }
    if (L.v === 'sparkles') {
      [[-60, -30, 70], [60, -60, 42], [50, 55, 52]].forEach(function (p) {
        filled(function () { var x = p[0] * k, y = p[1] * k, r = p[2] * k; g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r * 0.75, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r * 0.75, y); g.quadraticCurveTo(x, y, x, y - r); g.closePath(); });
      });
      return { w: 240 * k, h: 240 * k };
    }
    if (L.v === 'heart') {
      filled(function () { var s = 4.2 * k; g.beginPath(); g.moveTo(0, 30 * s); g.bezierCurveTo(-40 * s, 2 * s, -26 * s, -26 * s, 0, -10 * s); g.bezierCurveTo(26 * s, -26 * s, 40 * s, 2 * s, 0, 30 * s); g.closePath(); });
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-62 * k, -40 * k, 16 * k, 10 * k, -0.6, 0, 7); g.fill();
      return { w: 190 * k, h: 190 * k };
    }
    filled(function () { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 40 : 95) * k; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 8 * k); } g.closePath(); });
    return { w: 200 * k, h: 200 * k };
  }

  function drawCaptions(g, W, H, u, plan, t) {
    var st = plan.st, cue = null;
    for (var i = 0; i < plan.cues.length; i++) { if (t >= plan.cues[i].s && t < plan.cues[i].e) { cue = plan.cues[i]; break; } }
    if (!cue) return;
    var style = st.capStyle, fname = style === 'comic' && st.capFont === 'Anton' ? 'Bangers' : st.capFont;
    var fs = 76 * u * st.capSize * (RS.FONT_SCALE[fname] || 1) * (style === 'minimal' ? 0.82 : style === 'clean' ? 0.88 : 1);
    g.font = font(fname, fs);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
    var activeIdx = -1;
    cue.words.forEach(function (w, k) { if (t >= w[0]) activeIdx = k; });
    var items = cue.words.map(function (w, k) {
      var txt = String(w[2]).replace(/[.,;:]+$/, '');
      if (st.capUpper) txt = txt.toUpperCase();
      return { txt: txt, w: g.measureText(txt).width, k: k, s: w[0], active: k === activeIdx, past: k < activeIdx };
    });
    var gap = fs * 0.28, maxW = W * 0.84, lines = wrapWords(g, items, maxW, gap), lh = fs * (style === 'boxed' ? 1.32 : 1.12);
    var cy = H * st.capPos, top = cy - (lines.length - 1) * lh / 2;
    var rot = style === 'comic' ? ((Math.round(cue.s * 7) % 3) - 1) * 0.045 : 0;
    g.save(); g.translate(W / 2, cy); g.rotate(rot); g.translate(-W / 2, -cy);
    if (st.capEmoji) {
      var em = '';
      cue.words.some(function (w) { em = RS.emojiFor(w[2]); return !!em; });
      if (em) {
        var ep = popIn((t - cue.s) / 0.35), es = fs * 1.45 * ep;
        g.save(); g.font = Math.round(es) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center';
        g.fillText(em, W / 2, top - lh * 0.6 - fs * 0.85); g.restore();
        g.font = font(fname, fs); g.textAlign = 'left';
      }
    }
    lines.forEach(function (line, li) {
      var y = top + li * lh, x = (W - lineWidth(line, gap)) / 2;
      if (style === 'boxed') {
        var pad = fs * 0.28;
        g.fillStyle = INK; rr(g, x - pad + 6 * u, y - lh / 2 + 6 * u, lineWidth(line, gap) + pad * 2, lh - 4 * u, 16 * u); g.fill();
        g.fillStyle = '#FFFFFF'; rr(g, x - pad, y - lh / 2, lineWidth(line, gap) + pad * 2, lh - 4 * u, 16 * u); g.fill();
      }
      line.forEach(function (it) {
        var sc = 1;
        if (it.active && (style === 'pop' || style === 'comic' || style === 'neon')) sc = 1 + 0.12 * (1 - ease((t - it.s) / 0.18)) + 0.04;
        g.save(); g.translate(x + it.w / 2, y); g.scale(sc, sc); g.translate(-it.w / 2, 0);
        var fill = st.capColor;
        if (style === 'pop' || style === 'comic' || style === 'neon') fill = it.active ? st.hl : st.capColor;
        if (style === 'karaoke') fill = it.active || it.past ? st.hl : st.capColor;
        if (style === 'pop' || style === 'karaoke' || style === 'comic') {
          g.lineWidth = fs * (style === 'comic' ? 0.22 : 0.16); g.strokeStyle = '#000';
          g.fillStyle = '#000'; g.fillText(it.txt, fs * 0.06, fs * 0.07); g.strokeText(it.txt, 0, 0);
          g.fillStyle = fill; g.fillText(it.txt, 0, 0);
        } else if (style === 'boxed') {
          if (it.active) { g.fillStyle = st.hl; rr(g, -fs * 0.12, -lh * 0.4, it.w + fs * 0.24, lh * 0.76, 12 * u); g.fill(); }
          g.fillStyle = INK; g.fillText(it.txt, 0, 0);
        } else if (style === 'neon') {
          g.shadowColor = st.hl; g.shadowBlur = (it.active ? 40 : 18) * u; g.fillStyle = fill; g.fillText(it.txt, 0, 0);
          g.shadowBlur = 0; g.fillText(it.txt, 0, 0);
        } else if (style === 'clean') {
          // plain text with a soft shadow, no box: a wide soft shadow for contrast, then a tight one for crisp edges
          g.fillStyle = fill;
          g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 24 * u; g.shadowOffsetY = 4 * u; g.fillText(it.txt, 0, 0);
          g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 5 * u; g.shadowOffsetY = 2 * u; g.fillText(it.txt, 0, 0);
          g.shadowColor = 'transparent';
        } else {
          g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 14 * u; g.shadowOffsetY = 3 * u; g.fillStyle = fill; g.fillText(it.txt, 0, 0);
          g.shadowColor = 'transparent';
          if (it.active) { g.fillStyle = st.hl; rr(g, 0, fs * 0.5, it.w, 7 * u, 3 * u); g.fill(); }
        }
        g.restore();
        x += it.w + gap;
      });
    });
    g.restore();
  }

  function sticker(g, text, cx, cy, maxW, fs, bg, fg, u, rot, scale) {
    g.save();
    g.font = font('Bricolage Grotesque', fs); g.textBaseline = 'middle'; g.textAlign = 'center';
    var words = text.split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var tryL = cur ? cur + ' ' + w : w; if (cur && g.measureText(tryL).width > maxW) { lines.push(cur); cur = w; } else cur = tryL; });
    if (cur) lines.push(cur);
    lines = lines.slice(0, 3);
    var lh = fs * 1.12, bw = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })) + fs * 1.0, bh = lines.length * lh + fs * 0.6;
    g.translate(cx, cy); g.rotate(rot); g.scale(scale, scale);
    g.fillStyle = INK; rr(g, -bw / 2 + 12 * u, -bh / 2 + 12 * u, bw, bh, 26 * u); g.fill();
    g.fillStyle = bg; rr(g, -bw / 2, -bh / 2, bw, bh, 26 * u); g.fill();
    g.lineWidth = 6 * u; g.strokeStyle = INK; g.stroke();
    g.fillStyle = fg;
    lines.forEach(function (l, i) { g.fillText(l, 0, -bh / 2 + fs * 0.3 + lh * (i + 0.5)); });
    g.restore();
    return bh;
  }
  function inkOn(hex) {  // dark text on light colours, white on dark ones
    var n = parseInt(String(hex || '#ffffff').slice(1), 16), r = n >> 16, gg = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * gg + 0.114 * b) > 150 ? INK : '#FFFFFF';
  }
  RS.inkOn = inkOn;

  function drawOverlays(g, W, H, u, plan, t, still) {
    var st = plan.st, D = plan.outDur;
    if (st.hook && t < st.hookSecs) {
      var p = still ? 1 : popIn(t / 0.32), out = st.hookSecs - t < 0.2 ? (st.hookSecs - t) / 0.2 : 1;
      g.save(); g.globalAlpha = RS.clamp(out, 0, 1);
      var hy = st.layout === 'framed' ? H * 0.12 : H * 0.14;
      sticker(g, st.hook, W / 2, hy, W * 0.74, 60 * u, st.hookBg, inkOn(st.hookBg), u, -0.04, Math.max(0.01, p));
      g.restore();
    }
    if (st.part) {
      g.save(); g.font = font('Bricolage Grotesque', 34 * u); g.textBaseline = 'middle';
      var tw = g.measureText(st.part.toUpperCase()).width + 36 * u, px = 44 * u, py = (st.hook && t < st.hookSecs ? H * 0.24 : 60 * u);
      g.translate(px + tw / 2, py); g.rotate(0.05);
      g.fillStyle = INK; rr(g, -tw / 2 + 6 * u, -28 * u, tw, 56 * u, 28 * u); g.fill();
      g.fillStyle = '#FF3D8B'; rr(g, -tw / 2, -34 * u, tw, 56 * u, 28 * u); g.fill(); g.lineWidth = 4 * u; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.textAlign = 'center'; g.fillText(st.part.toUpperCase(), 0, -6 * u);
      g.restore();
    }
    if (st.handle && st.handlePos !== 'off') {
      var hdl = st.handle.charAt(0) === '@' ? st.handle : '@' + st.handle;
      g.save(); g.font = font('DM Sans', 34 * u); g.textBaseline = 'middle'; g.globalAlpha = 0.9;
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10 * u; g.fillStyle = '#FFFFFF';
      var right = st.handlePos === 'tr' || st.handlePos === 'br', bottom = st.handlePos === 'bl' || st.handlePos === 'br';
      g.textAlign = right ? 'right' : 'left';
      g.fillText(hdl, right ? W - 44 * u : 44 * u, bottom ? H - 70 * u : 66 * u);
      g.restore();
    }
    if (st.cta && st.ctaText && D > 5 && D - t < 2.6) {
      var cp = still ? 1 : popIn((2.6 - (D - t)) / 0.35);
      sticker(g, st.ctaText, W / 2, H * 0.88, W * 0.7, 48 * u, '#FF3D8B', INK, u, 0.03, Math.max(0.01, cp));
    }
    if (st.progress && D > 0) {
      var bh = 14 * u;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, H - bh, W, bh);
      g.fillStyle = st.progColor; g.fillRect(0, H - bh, W * RS.clamp(t / D, 0, 1), bh);
    }
  }

  /* ------------------------------------------------------------------ a stand-in picture for style previews (brand kit, templates) */
  var demoSrc = null;
  RS.demoSource = function () {
    if (demoSrc) return demoSrc;
    var c = document.createElement('canvas'); c.width = 640; c.height = 360;
    var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 640, 360); gr.addColorStop(0, '#8FD3FF'); gr.addColorStop(1, '#FF8FC1');
    g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
    g.fillStyle = 'rgba(255,255,255,.25)'; [[80, 70, 30], [560, 90, 44], [520, 290, 26], [120, 300, 36]].forEach(function (b) { g.beginPath(); g.arc(b[0], b[1], b[2], 0, 7); g.fill(); });
    g.fillStyle = INK; g.fillRect(0, 290, 640, 70);
    g.save(); g.translate(320, 195);
    g.fillStyle = '#7B5CFF'; g.beginPath(); g.ellipse(0, 0, 118, 104, 0, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    [-38, 38].forEach(function (x) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, -26, 20, 24, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(x + 4, -22, 9, 0, 7); g.fill(); });
    g.fillStyle = INK; g.beginPath(); g.ellipse(0, 32, 30, 18, 0, 0, 7); g.fill();
    g.restore();
    demoSrc = c;
    return c;
  };
  RS.DEMO_WORDS = [[0, 0.4, 'This'], [0.4, 0.7, 'is'], [0.7, 1.0, 'the'], [1.0, 1.5, 'best'], [1.5, 2.2, 'snack'], [2.2, 2.9, 'ever!']];
  /* Draw a still preview of a style into a canvas (no video needed). */
  RS.stylePreview = function (canvas, style, opt) {
    opt = opt || {};
    var st = RS.fullStyle(style), d = RS.dims(st.aspect, '720'), scale = (opt.width || 216) / d[0];
    canvas.width = Math.round(d[0] * scale); canvas.height = Math.round(d[1] * scale);
    var plan = { st: Object.assign({}, st, { punch: false, fadeIn: false, fadeOut: false, hook: opt.hook != null ? opt.hook : st.hook }), segs: [[0, 6]], srcLen: 6, outDur: 6, analysis: null,
      cues: st.captions ? RS.cues(RS.DEMO_WORDS, 0, 6, st.capWords) : [], joins: [] };
    if (!plan.st.handle && opt.handle) plan.st.handle = opt.handle;
    RS.render(canvas.getContext('2d'), canvas.width, canvas.height, RS.demoSource(), plan, 1.6, opt.t != null ? opt.t : 1.4);
  };

  /* ------------------------------------------------------------------ the live preview */
  RS.Player = function (canvas, m, getPlan, onTick) {
    var v = m.el, g = canvas.getContext('2d'), raf = 0, playing = false, dead = false, music = null, self = {};
    v.muted = false;
    function seg(plan, t) {
      for (var i = 0; i < plan.segs.length; i++) if (t < plan.segs[i][1] - 0.03) return i;
      return -1;
    }
    /* the picture-in-picture video (plan.pipSrc) follows reel time: playing along, or parked on the right frame */
    function syncPip(plan, o) {
      var pv = plan.pipSrc; if (!pv || !(pv.duration > 0)) return;
      var target = o % pv.duration;
      if (playing) {
        if (pv.paused) { var pp = pv.play(); if (pp && pp.catch) pp.catch(function () {}); }
        if (Math.abs(pv.currentTime - target) > 0.3) pv.currentTime = target;
      } else {
        if (!pv.paused) pv.pause();
        if (Math.abs(pv.currentTime - target) > 0.05 && !pv.seeking) { pv.currentTime = target; pv.onseeked = function () { if (!playing && !dead) draw(); }; }
      }
    }
    function draw() {
      var plan = getPlan(); if (!plan) return;
      var t = v.currentTime, o = RS.srcToOut(plan, t);
      syncPip(plan, o);
      RS.render(g, canvas.width, canvas.height, v, plan, t, o, Object.assign({ noFade: !playing }, self.opt));
      if (onTick) onTick(o, plan.outDur, playing);
    }
    function loop() {
      if (dead) return;
      var plan = getPlan();
      if (playing && plan) {
        var t = v.currentTime, i = seg(plan, t);
        if (i < 0) { self.pause(); RS.seek(v, plan.segs[0][0]).then(draw); return; }
        if (t < plan.segs[i][0] - 0.05) v.currentTime = plan.segs[i][0];
        if (music) {
          var lvl = plan.st.duck && RS.speakingAt(plan.analysis, t) ? 0.35 : 1;
          music.volume = RS.clamp(plan.st.musicVol * lvl, 0, 1);
        }
      }
      draw();
      if (playing) raf = requestAnimationFrame(loop);
    }
    self.play = function () {
      var plan = getPlan(); if (!plan) return;
      var t = v.currentTime;
      if (t < plan.segs[0][0] - 0.05 || seg(plan, t) < 0) v.currentTime = plan.segs[0][0];
      v.playbackRate = plan.st.speed; v.volume = RS.clamp(plan.st.vol, 0, 1);
      playing = true;
      var p = v.play(); if (p && p.catch) p.catch(function () { playing = false; draw(); });
      if (self.musicFile) {
        if (!music) { music = new Audio(URL.createObjectURL(self.musicFile)); music.loop = true; }
        try { music.currentTime = RS.srcToOut(plan, v.currentTime) % (music.duration || 1e9); } catch (e) {}
        music.play().catch(function () {});
      }
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    };
    self.pause = function () { playing = false; v.pause(); if (music) music.pause(); var pl = getPlan(); if (pl && pl.pipSrc) pl.pipSrc.pause(); cancelAnimationFrame(raf); draw(); };
    self.toggle = function () { playing ? self.pause() : self.play(); };
    self.playing = function () { return playing; };
    self.seekOut = function (o) { var plan = getPlan(); if (!plan) return Promise.resolve(); return RS.seek(v, RS.outToSrc(plan, RS.clamp(o, 0, plan.outDur - 0.01))).then(draw); };
    self.seekSrc = function (t) { return RS.seek(v, t).then(draw); };
    self.draw = draw;
    self.opt = {};  // extra render options from the editor: {boxes: [], selected: layerId}
    self.setMusic = function (file) { if (music) { music.pause(); URL.revokeObjectURL(music.src); music = null; } self.musicFile = file || null; };
    self.destroy = function () { dead = true; self.pause(); self.setMusic(null); };
    v.addEventListener('seeked', function () { if (!dead && !playing) draw(); });
    return self;
  };

  /* ------------------------------------------------------------------ export */
  RS.recorderType = function () {
    if (!window.MediaRecorder) return null;
    var list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  };
  RS.canExport = function () { return !!(RS.recorderType() && HTMLCanvasElement.prototype.captureStream && window.AudioContext); };
  /* opts: {quality, music (File), onProgress(fraction, canvas), signal: {aborted}} -> Promise of {blob, ext, mime, seconds} */
  RS.exportClip = function (m, plan, opts) {
    opts = opts || {};
    var st = plan.st, mime = RS.recorderType();
    if (!mime) return Promise.reject(new Error('This browser can\'t record video. Try Chrome, Edge or Safari on a computer.'));
    var d = RS.dims(st.aspect, opts.quality || st.quality), W = d[0], H = d[1];
    var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    var ac, rec, v, music, musicUrl, cleanup = [];
    function finish() { cleanup.forEach(function (f) { try { f(); } catch (e) {} }); }
    var pipV = null;
    return RS.fontsReady().then(function () {
      if (!plan.pipSrc || !plan.pipSrc.src) return null;
      return RS.videoEl(plan.pipSrc.src).then(function (pv) { pipV = pv; pv.muted = true; cleanup.push(function () { pv.pause(); pv.removeAttribute('src'); pv.load(); }); }, function () { return null; });
    }).then(function () {
      plan = Object.assign({}, plan, { pipSrc: pipV });
      if (plan.st.layers.some(function (L) { return L.behind; })) return RS.person.load().catch(function () {});
    }).then(function () { return RS.videoEl(m.url); }).then(function (vid) {
      v = vid; cleanup.push(function () { v.pause(); v.removeAttribute('src'); v.load(); });
      ac = new (window.AudioContext || window.webkitAudioContext)();
      cleanup.push(function () { ac.close(); });
      var dest = ac.createMediaStreamDestination();
      var srcNode = ac.createMediaElementSource(v), vg = ac.createGain();
      vg.gain.value = st.fadeIn ? 0 : st.vol;
      srcNode.connect(vg); vg.connect(dest);
      var mg = null;
      if (opts.music) {
        musicUrl = URL.createObjectURL(opts.music);
        music = new Audio(musicUrl); music.loop = true;
        cleanup.push(function () { music.pause(); URL.revokeObjectURL(musicUrl); });
        var ms = ac.createMediaElementSource(music); mg = ac.createGain(); mg.gain.value = st.musicVol;
        ms.connect(mg); mg.connect(dest);
      }
      var stream = new MediaStream([canvas.captureStream(30).getVideoTracks()[0]].concat(dest.stream.getAudioTracks()));
      var bps = W * H > 1e6 ? 9e6 : 5e6;
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 160000 });
      var chunks = []; rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      v.playbackRate = st.speed; v.muted = false; v.volume = 1;
      var segI = 0, outBase = 0, ended = false;
      return ac.resume().then(function () { return RS.seek(v, plan.segs[0][0]); }).then(function () {
        RS.render(g, W, H, v, plan, v.currentTime, 0);
        return new Promise(function (resolve, reject) {
          rec.onstop = function () { resolve(new Blob(chunks, { type: mime.split(';')[0] })); };
          rec.onerror = function (e) { reject(e.error || new Error('Recording failed.')); };
          rec.start(500);
          var useVFC = 'requestVideoFrameCallback' in v, pending = false, seeking = false;
          function tick() {
            if (ended || seeking) return;
            if (opts.signal && opts.signal.aborted) { ended = true; v.pause(); try { rec.stop(); } catch (e) {} reject(Object.assign(new Error('Export cancelled.'), { cancelled: true })); return; }
            var s = plan.segs[segI], t = v.currentTime;
            var o = outBase + (t - s[0]) / st.speed;
            RS.render(g, W, H, v, plan, t, o);
            if (pipV && pipV.duration > 0) { var pt = o % pipV.duration; if (pipV.paused) pipV.play().catch(function () {}); if (Math.abs(pipV.currentTime - pt) > 0.25) pipV.currentTime = pt; }
            var now = ac.currentTime, toEnd = plan.outDur - o;
            var gainV = st.vol * (st.fadeIn ? RS.clamp(o / 0.3, 0, 1) : 1) * (st.fadeOut ? RS.clamp(toEnd / 0.4, 0, 1) : 1);
            vg.gain.setTargetAtTime(gainV, now, 0.03);
            if (mg) mg.gain.setTargetAtTime(st.musicVol * (st.duck && RS.speakingAt(plan.analysis, t) ? 0.35 : 1) * (st.fadeOut ? RS.clamp(toEnd / 0.6, 0, 1) : 1), now, 0.12);
            if (opts.onProgress) opts.onProgress(RS.clamp(o / plan.outDur, 0, 1), canvas);
            if (t >= s[1] - 0.02 || v.ended) {
              outBase += (s[1] - s[0]) / st.speed;
              segI++;
              if (segI >= plan.segs.length) { ended = true; v.pause(); if (music) music.pause(); RS.render(g, W, H, v, plan, t, plan.outDur - 0.001); setTimeout(function () { rec.stop(); }, 120); return; }
              v.pause(); rec.pause(); seeking = true; if (pipV) pipV.pause();
              RS.seek(v, plan.segs[segI][0]).then(function () {
                RS.render(g, W, H, v, plan, v.currentTime, outBase);
                rec.resume(); seeking = false; return v.play();
              }).then(schedule, reject);
              return;
            }
            schedule();
          }
          function run() { pending = false; tick(); }
          function schedule() { if (ended || pending) return; pending = true; if (useVFC) v.requestVideoFrameCallback(run); else requestAnimationFrame(run); }
          // Hidden tabs get no frame callbacks: keep drawing from a timer so the reel doesn't freeze.
          var guard = setInterval(function () { if (ended) clearInterval(guard); else if (document.hidden) tick(); }, 200);
          cleanup.push(function () { clearInterval(guard); });
          var p = v.play();
          if (music) music.play().catch(function () {});
          (p && p.then ? p : Promise.resolve()).then(schedule, function (e) { ended = true; try { rec.stop(); } catch (x) {} reject(new Error('The video wouldn\'t play for recording: ' + (e && e.message || e))); });
        });
      });
    }).then(function (blob) {
      finish();
      return { blob: blob, mime: mime, ext: /mp4/.test(mime) ? 'mp4' : 'webm', seconds: +plan.outDur.toFixed(1), width: W, height: H };
    }, function (e) { finish(); throw e; });
  };

  /* ------------------------------------------------------------------ .srt timed to the exported reel */
  RS.srt = function (plan, words) {
    var cues = RS.cues(words, plan.clip.start, plan.clip.end, Math.max(plan.st.capWords, 4)), n = 0;
    function ts(s) { s = Math.max(0, s); var ms = Math.round(s * 1000); var h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60;
      return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' + String(se).padStart(2, '0') + ',' + String(ms % 1000).padStart(3, '0'); }
    return cues.map(function (c) {
      var a = RS.srcToOut(plan, c.s), b = RS.srcToOut(plan, c.e);
      if (b - a < 0.05) return '';
      return (++n) + '\n' + ts(a) + ' --> ' + ts(b) + '\n' + c.text + '\n';
    }).filter(Boolean).join('\n');
  };
})();
