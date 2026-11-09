/* rs-smart.js: moved unchanged from the JavaScript version (web/pages/_b_smart.html). Analysis, Find reels, captions (Whisper worker), post copy. */
(function () {
  'use strict';
  var RS = window.RS;

  /* ------------------------------------------------------------------ analysis */
  var HOP = 0.05;  // seconds per loudness value
  RS.HOP = HOP;

  function decodeMono(blob, rate) {
    if (blob.size > 1.6e9) return Promise.reject(new Error('too big to decode'));
    return blob.arrayBuffer().then(function (buf) {
      var ac = new OfflineAudioContext(1, rate, rate);
      return new Promise(function (res, rej) { ac.decodeAudioData(buf, res, rej); });
    }).then(function (ab) {
      if (ab.numberOfChannels === 1) return { data: ab.getChannelData(0), rate: ab.sampleRate };
      var out = new Float32Array(ab.length), n = ab.numberOfChannels;
      for (var ch = 0; ch < n; ch++) { var d = ab.getChannelData(ch); for (var i = 0; i < d.length; i++) out[i] += d[i] / n; }
      return { data: out, rate: ab.sampleRate };
    });
  }
  RS.decodeMono = decodeMono;

  function envelope(data, rate) {
    var hop = Math.round(rate * HOP), n = Math.floor(data.length / hop), env = new Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0, o = i * hop;
      for (var j = 0; j < hop; j++) { var x = data[o + j]; s += x * x; }
      env[i] = Math.round(Math.max(-90, 10 * Math.log10(s / hop + 1e-10)) * 10) / 10;
    }
    return env;
  }
  function pct(arr, p) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  }

  /* Look at the whole video once. onProgress(fraction, message). Cached per project (memory + vault). */
  RS.analyze = function (m, onProgress) {
    var prog = onProgress || function () {};
    var a = { v: 2, duration: m.duration, hop: HOP, env: null, gaps: [], cuts: [], thumbs: [], floor: -60, loud: -20, thr: -45, notes: [] };
    prog(0.02, 'Listening for the loud bits…');
    return decodeMono(m.blob, 8000).then(function (au) {
      a.env = envelope(au.data, au.rate);
    }, function (e) {
      console.warn('audio decode', e);
      a.notes.push(m.blob.size > 1.6e9 ? 'This video is very big, so we skipped the sound check and used the picture only.' : 'We couldn\'t read this video\'s sound, so we used the picture only.');
    }).then(function () {
      if (a.env && a.env.length) {
        a.floor = pct(a.env, 0.1); a.loud = pct(a.env, 0.95);
        a.thr = Math.max(a.floor + 6, a.floor + (a.loud - a.floor) * 0.3);
        a.gaps = findGaps(a.env, a.thr, 0.3);
      }
      prog(0.3, 'Spotting scene changes…');
      return scanPicture(m, a, function (f) { prog(0.3 + f * 0.65, f < 0.5 ? 'Spotting scene changes…' : 'Making the timeline thumbnails…'); });
    }).then(function () {
      prog(1, 'Done!');
      RS.analyses[m.pid] = a;
      if (!m.blob.isSample) RS.vault.saveJSON('analysis-' + m.pid + '.json', a);
      return a;
    });
  };
  RS.loadAnalysis = function (pid) {
    if (RS.analyses[pid]) return Promise.resolve(RS.analyses[pid]);
    return RS.vault.getJSON('analysis-' + pid + '.json').then(function (a) { if (a && a.v === 2) RS.analyses[pid] = a; return RS.analyses[pid] || null; });
  };

  function findGaps(env, thr, minLen) {
    var gaps = [], start = -1, minN = Math.round(minLen / HOP);
    for (var i = 0; i <= env.length; i++) {
      var quiet = i < env.length && env[i] < thr;
      if (quiet && start < 0) start = i;
      if (!quiet && start >= 0) { if (i - start >= minN) gaps.push([+(start * HOP).toFixed(2), +(i * HOP).toFixed(2)]); start = -1; }
    }
    return gaps;
  }

  function scanPicture(m, a, prog) {
    var d = m.duration, step = RS.clamp(d / 260, 0.5, 5), n = Math.max(2, Math.floor(d / step));
    var thumbEvery = Math.max(1, Math.round(n / 48));
    var cv = document.createElement('canvas'); cv.width = 32; cv.height = 18;
    var g = cv.getContext('2d', { willReadFrequently: true });
    var tc = document.createElement('canvas'); tc.width = 160; tc.height = Math.round(160 * (m.height || 9) / (m.width || 16));
    var tg = tc.getContext('2d');
    var prev = null, diffs = [], times = [];
    return RS.videoEl(m.url).then(function (v) {
      v.muted = true;
      var i = 0;
      function next() {
        if (i >= n) { v.removeAttribute('src'); v.load(); return finish(); }
        var t = Math.min(d - 0.05, i * step + step / 2);
        return RS.seek(v, t).then(function () {
          g.drawImage(v, 0, 0, 32, 18);
          var px = g.getImageData(0, 0, 32, 18).data, lum = new Float32Array(576), hist = new Float32Array(24);
          for (var k = 0, p = 0; k < px.length; k += 4, p++) {
            lum[p] = 0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2];
            hist[px[k] >> 5]++; hist[8 + (px[k + 1] >> 5)]++; hist[16 + (px[k + 2] >> 5)]++;
          }
          if (prev) {
            var dl = 0, dh = 0;
            for (var q = 0; q < 576; q++) dl += Math.abs(lum[q] - prev.lum[q]);
            for (q = 0; q < 24; q++) dh += Math.abs(hist[q] - prev.hist[q]);
            diffs.push(0.5 * dl / 576 / 255 + 0.5 * dh / (576 * 3 * 2)); times.push(t - step / 2);
          }
          prev = { lum: lum, hist: hist };
          if (i % thumbEvery === 0) { tg.drawImage(v, 0, 0, tc.width, tc.height); a.thumbs.push({ t: +t.toFixed(2), src: tc.toDataURL('image/jpeg', 0.6) }); }
          i++; prog(i / n);
          return next();
        });
      }
      function finish() {
        var med = pct(diffs, 0.5), thr = Math.max(0.09, med * 3.5);
        for (var k = 0; k < diffs.length; k++) {
          if (diffs[k] > thr && (k === 0 || diffs[k] >= diffs[k - 1]) && (k === diffs.length - 1 || diffs[k] >= diffs[k + 1])) a.cuts.push(+times[k].toFixed(2));
        }
        a.step = step;
      }
      return next();
    });
  }

  /* 0..1 loudness at a time (for punch-in zooms, ducking, waveforms) */
  RS.levelAt = function (a, t) {
    if (!a || !a.env) return 0;
    var i = Math.floor(t / HOP);
    if (i < 0 || i >= a.env.length) return 0;
    return RS.clamp((a.env[i] - a.thr) / Math.max(6, a.loud - a.thr), 0, 1);
  };
  RS.speakingAt = function (a, t) { return a && a.env ? (a.env[Math.floor(t / HOP)] || -90) > a.thr : true; };

  /* ------------------------------------------------------------------ the reel finder */
  var HYPE = /^(wow|omg|insane|incredible|crazy|best|worst|never|always|secret|ever|amazing|literally|unbelievable|huge|biggest|craziest|wild|epic|perfect|stop|wait|seriously|okay|honestly|truth|mistake|hack|trick|tip|why|how|what)$/i;
  RS.findClips = function (a, words, opt) {
    opt = opt || {};
    var L = +opt.length || 30, count = +opt.count || 5, vibe = opt.vibe || 'balanced', D = a.duration;
    if (D < 3) return [];
    var env = a.env, n = env ? env.length : 0;
    // prefix sums over the loudness timeline
    var pE = [0], pS = [0], pP = [0], pK = [0];
    var lv = env ? env.map(function (x) { return RS.clamp((x - a.thr) / Math.max(6, a.loud - a.thr), 0, 1); }) : [];
    var sm = lv.map(function (_, i) { var s = 0, c = 0; for (var j = Math.max(0, i - 20); j < Math.min(lv.length, i + 20); j++) { s += lv[j]; c++; } return s / c; });
    var hi = pct(sm, 0.88);
    var kw = new Float32Array(Math.max(n, Math.ceil(D / HOP) + 1));
    (words || []).forEach(function (w) {
      var i = Math.floor(w[0] / HOP); if (i >= kw.length) return;
      var t = String(w[2]);
      kw[i] += (HYPE.test(t.replace(/[^a-z']/gi, '')) ? 1 : 0) + (/[!?]$/.test(t) ? 0.8 : 0) + (/\d/.test(t) ? 0.4 : 0);
    });
    var N = kw.length;
    for (var i = 0; i < N; i++) {
      pE.push(pE[i] + (lv[i] || 0)); pS.push(pS[i] + (env && env[i] > a.thr ? 1 : 0));
      pP.push(pP[i] + (i > 0 && i < n - 1 && sm[i] > hi && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] ? 1 : 0)); pK.push(pK[i] + kw[i]);
    }
    function sum(p, s, e) { var i0 = RS.clamp(Math.floor(s / HOP), 0, N), i1 = RS.clamp(Math.floor(e / HOP), 0, N); return p[i1] - p[i0]; }
    var cuts = a.cuts || [];
    function cutsIn(s, e) { return cuts.filter(function (c) { return c > s && c < e; }).length; }
    // natural starts / ends: where speech starts after a pause, scene cuts, and the very start / end
    var starts = [0], ends = [D];
    (a.gaps || []).forEach(function (g) { starts.push(Math.max(0, g[1] - 0.15)); ends.push(Math.min(D, g[0] + 0.25)); });
    cuts.forEach(function (c) { starts.push(c); ends.push(c); });
    if (!env && !cuts.length) for (var t = 0; t < D; t += L / 2) { starts.push(t); ends.push(Math.min(D, t + L)); }
    starts = uniq(starts); ends = uniq(ends);
    var W = { hype: [1.3, 1.1, 0.9, 0.2, 0.6, 0.9], story: [0.3, 0.2, 0.1, 1.3, 0.9, 0.4], balanced: [0.8, 0.7, 0.6, 0.7, 0.7, 0.7] }[vibe] || [0.8, 0.7, 0.6, 0.7, 0.7, 0.7];
    var cands = [];
    starts.forEach(function (s) {
      var lo = s + L * 0.7, hiE = s + L * 1.3, fit = ends.filter(function (e) { return e >= lo && e <= hiE; });
      if (!fit.length) { if (s + L <= D + 0.01) fit = [Math.min(D, s + L)]; else return; }
      fit.forEach(function (e) {
        var len = e - s; if (len < Math.min(L * 0.5, D)) return;
        var f = { energy: sum(pE, s, e) / (len / HOP), peaks: sum(pP, s, e) / len * 10, pace: cutsIn(s, e) / len * 10,
          speech: env ? sum(pS, s, e) / (len / HOP) : 0.5, kw: sum(pK, s, e) / len * 10, hook: sum(pE, s, Math.min(e, s + 3)) / (Math.min(3, len) / HOP),
          fit: 1 - Math.abs(len - L) / L, clean: ends.indexOf(e) >= 0 ? 1 : 0 };
        cands.push({ s: s, e: e, f: f });
      });
    });
    if (!cands.length) return [];
    var keys = ['energy', 'peaks', 'pace', 'speech', 'kw', 'hook'], mm = {};
    keys.forEach(function (k) { var vals = cands.map(function (c) { return c.f[k]; }); mm[k] = [Math.min.apply(null, vals), Math.max.apply(null, vals)]; });
    cands.forEach(function (c) {
      c.n = {}; c.total = 0;
      keys.forEach(function (k, j) { var r = mm[k][1] - mm[k][0]; c.n[k] = r > 1e-9 ? (c.f[k] - mm[k][0]) / r : 0.5; c.total += W[j] * c.n[k]; });
      c.total += 0.5 * c.f.fit + 0.25 * c.f.clean;
    });
    cands.sort(function (x, y) { return y.total - x.total; });
    var all = cands.map(function (c) { return c.total; }).sort(function (x, y) { return x - y; });
    var picked = [];
    for (var k = 0; k < cands.length && picked.length < count; k++) {
      var c = cands[k];
      if (picked.some(function (p) { return c.s < p.e - 0.5 && c.e > p.s + 0.5; })) continue;
      picked.push(c);
    }
    picked.sort(function (x, y) { return x.s - y.s; });
    return picked.map(function (c, i) {
      var rank = all.indexOf(c.total) / Math.max(1, all.length - 1);
      var lbl = label(c.n), inWords = (words || []).filter(function (w) { return w[0] >= c.s && w[0] < c.e; });
      return { start: +c.s.toFixed(2), end: +c.e.toFixed(2), score: Math.round(52 + 47 * rank), label: lbl,
        title: titleFrom(inWords, lbl, c.s), hook: hookFrom(inWords, lbl), source: 'auto' };
    });
  };
  function uniq(arr) { return arr.map(function (x) { return +x.toFixed(2); }).sort(function (a, b) { return a - b; }).filter(function (x, i, s) { return !i || x - s[i - 1] > 0.3; }); }
  function label(n) {
    var opts = [['🔥 Hype spike', (n.energy + n.peaks) / 2], ['🎬 Fast cuts', n.pace], ['💬 Story time', n.speech * 0.9], ['🎯 Quotable', n.kw], ['⚡ Strong hook', n.hook * 0.95]];
    opts.sort(function (a, b) { return b[1] - a[1]; });
    return opts[0][0];
  }
  function sentences(words) {
    var out = [], cur = [];
    words.forEach(function (w) { cur.push(w[2]); if (/[.!?]$/.test(w[2])) { out.push(cur.join(' ')); cur = []; } });
    if (cur.length) out.push(cur.join(' '));
    return out;
  }
  function titleFrom(words, lbl, s) {
    var ss = sentences(words);
    if (!ss.length) return lbl.replace(/^\S+\s/, '') + ' at ' + RS.fmt(s);
    var best = ss.filter(function (x) { return /[!?]$/.test(x); })[0] || ss[0];
    var w = best.replace(/[.,!?]+$/, '').split(' ');
    return (w.slice(0, 7).join(' ') + (w.length > 7 ? '…' : '')).replace(/^\w/, function (ch) { return ch.toUpperCase(); });
  }
  function hookFrom(words, lbl) {
    var ss = sentences(words).filter(function (x) { return x.split(' ').length <= 9; });
    var pick = ss.filter(function (x) { return /!$/.test(x); })[0] || ss.filter(function (x) { return /\?$/.test(x); })[0];
    if (pick) return pick;
    return { '🔥 Hype spike': 'Wait for it… 👀', '🎬 Fast cuts': 'Watch till the end 🎬', '💬 Story time': 'Story time 🍿', '🎯 Quotable': 'Save this one 📌', '⚡ Strong hook': 'You need to hear this' }[lbl] || 'Wait for it… 👀';
  }

  /* The parts of [start, end] that aren't silence. sensitivity 0..1 (higher = cuts more). */
  RS.keepRanges = function (a, start, end, sensitivity) {
    if (!a || !a.env) return [[start, end]];
    var sens = sensitivity == null ? 0.5 : sensitivity, thr = a.floor + (a.thr - a.floor) * (0.6 + sens * 0.8);
    var minGap = 0.65 - sens * 0.35, pad = 0.1;
    var gaps = findGaps(a.env.slice(Math.floor(start / HOP), Math.ceil(end / HOP)), thr, minGap).map(function (g) { return [g[0] + start, g[1] + start]; });
    var keep = [], cur = start;
    gaps.forEach(function (g) {
      var gs = g[0] + pad, ge = g[1] - pad;
      if (ge - gs < 0.15) return;
      if (gs > cur + 0.2) keep.push([cur, gs]);
      cur = ge;
    });
    if (end - cur > 0.2) keep.push([cur, end]);
    return keep.length ? keep : [[start, end]];
  };

  /* ------------------------------------------------------------------ captions */
  RS.wordsIn = function (words, s, e) { return (words || []).filter(function (w) { return w[1] > s && w[0] < e; }); };
  /* Caption lines: up to n words, breaking early at punctuation and pauses. */
  RS.cues = function (words, s, e, n) {
    var ws = RS.wordsIn(words, s, e), out = [], cur = [];
    function push() { if (cur.length) out.push({ s: cur[0][0], e: cur[cur.length - 1][1], words: cur }); cur = []; }
    ws.forEach(function (w, i) {
      if (cur.length && (cur.length >= n || w[0] - cur[cur.length - 1][1] > 0.6)) push();
      cur.push(w);
      if (/[.!?]$/.test(w[2]) || (/[,;:]$/.test(w[2]) && cur.length >= Math.min(2, n))) push();
    });
    push();
    out.forEach(function (c, i) { c.text = c.words.map(function (w) { return w[2]; }).join(' '); if (out[i + 1]) c.e = Math.max(c.e, Math.min(out[i + 1].s, c.e + 0.5)); else c.e += 0.4; });
    return out;
  };
  /* Spread a line of text over [s, e], word lengths deciding each word's share. */
  RS.spread = function (text, s, e) {
    var ws = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!ws.length) return [];
    var tot = ws.reduce(function (a, w) { return a + w.length + 2; }, 0), t = s, out = [];
    ws.forEach(function (w) { var d = (e - s) * (w.length + 2) / tot; out.push([+t.toFixed(3), +(t + d).toFixed(3), w.slice(0, 40)]); t += d; });
    return out;
  };
  RS.parseSubs = function (text) {
    var out = [], blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
    var tm = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
    function sec(h, m, s, ms) { return (h ? parseInt(h, 10) : 0) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt((ms + '00').slice(0, 3), 10) / 1000; }
    blocks.forEach(function (b) {
      var lines = b.split('\n'), i = lines.findIndex(function (l) { return tm.test(l); });
      if (i < 0) return;
      var m = lines[i].match(tm), s = sec(m[1], m[2], m[3], m[4]), e = sec(m[5], m[6], m[7], m[8]);
      var txt = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
      if (txt && e > s) out = out.concat(RS.spread(txt, s, e));
    });
    return out;
  };
  RS.parseChapters = function (text, duration) {
    var out = [];
    String(text || '').split(/\n/).forEach(function (line) {
      var m = line.match(/(?:^|\s|\()((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\)|\s|$|\s*[-–—|:]\s*)(.*)$/);
      if (!m) return;
      var t = RS.parseTime(m[1]);
      if (t == null || t >= duration) return;
      out.push({ t: t, title: (m[2] || line.replace(m[1], '')).replace(/^[\s\-–—|:)]+/, '').trim().slice(0, 100) || 'Chapter at ' + m[1] });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out.map(function (c, i) { return { start: c.t, end: i + 1 < out.length ? out[i + 1].t : duration, title: c.title }; })
      .filter(function (c) { return c.end - c.start >= 1; });
  };

  /* ------------------------------------------------------------------ emoji for caption words */
  var EMOJI = [[/^(fire|hot|lit|spicy)$/, '🔥'], [/^(money|cash|rich|dollars?|paid)$/, '💰'], [/^(love|loved|heart)$/, '❤️'], [/^(crazy|insane|wild|mind)$/, '🤯'],
    [/^(funny|laugh|lol|haha|joke)$/, '😂'], [/^(best|win|winner|champion|first)$/, '🏆'], [/^(secret|nobody|hidden)$/, '🤫'], [/^(snacks?|chips?|popcorn|food|eat|hungry)$/, '🍿'],
    [/^(cold|fridge|ice|freeze)$/, '🧊'], [/^(time|hours?|minutes?|clock)$/, '⏰'], [/^(idea|think|smart|brain)$/, '💡'], [/^(music|song|sing|sang)$/, '🎵'],
    [/^(game|gaming|play|level)$/, '🎮'], [/^(wow|omg|whoa|incredible|amazing)$/, '😱'], [/^(stop|no|never)$/, '🛑'], [/^(yes|perfect|ten|100)$/, '💯'],
    [/^(story|tell|told)$/, '📖'], [/^(trust|promise)$/, '🤝'], [/^(smoke|alarm|danger)$/, '🚨'], [/^(follow|subscribe|comment)$/, '👉'], [/^(bye|goodbye)$/, '👋'],
    [/^(mystery|guess|question)$/, '❓'], [/^(pickle|pickles)$/, '🥒'], [/^(microwave|cook|chef|kitchen)$/, '👨‍🍳'], [/^(coffee)$/, '☕'], [/^(gym|strong|workout)$/, '💪']];
  RS.emojiFor = function (word) {
    var w = String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < EMOJI.length; i++) if (EMOJI[i][0].test(w)) return EMOJI[i][1];
    return '';
  };

  /* ------------------------------------------------------------------ post caption + hashtags */
  var STOP = ('a an and are as at be been but by can could did do does dont for from get got had has have he her here him his how i if im in into is it its ' +
    'just let like me more my no not now of off oh ok okay on one or our out over really right so some that thats the their them then there these they this ' +
    'those to too up us very was we were what when where which who why will with would yeah you your youre about after again all also am any back because ' +
    'before being both down each even every going gonna know made make many most much need only other own same she should since still such than through ' +
    'under until want way well while yes').split(' ');
  RS.keywords = function (words, n) {
    var cnt = {};
    (words || []).forEach(function (w) {
      var t = String(w[2]).toLowerCase().replace(/[^a-z0-9']/g, '').replace(/'s$/, '');
      if (t.length < 4 || STOP.indexOf(t) >= 0) return;
      cnt[t] = (cnt[t] || 0) + 1 + t.length / 10;
    });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, n || 5);
  };
  RS.postCopy = function (clip, words, kit, seed) {
    var st = RS.fullStyle(clip.style), ws = RS.wordsIn(words, clip.start, clip.end), kws = RS.keywords(ws, 4);
    var hook = (st.hook || clip.title || 'New reel').replace(/\s+/g, ' ').trim();
    var emo = RS.emojiFor(kws[0]) || ['✨', '🔥', '👀', '🎬'][(seed || 0) % 4];
    var lines = [
      [hook + ' ' + emo, 'Full video on my channel 🎬'],
      [emo + ' ' + hook, 'Would you try this? Tell me in the comments 👇'],
      ['POV: ' + hook.replace(/[.!?]+$/, '').toLowerCase() + ' ' + emo, 'Follow for part 2 👀'],
      [hook, 'Save this for later 📌 ' + emo]
    ][(seed || 0) % 4];
    var tags = kws.map(function (k) { return '#' + k.replace(/'/g, ''); });
    var mine = String(kit && kit.hashtags || '').split(/[\s,]+/).filter(function (t) { return /^#\w/.test(t); });
    var base = ['#reels', '#shorts', '#fyp'];
    var all = [];
    mine.concat(tags, base).forEach(function (t) { if (all.indexOf(t.toLowerCase()) < 0) all.push(t.toLowerCase()); });
    return { caption: lines.join('\n\n'), hashtags: all.slice(0, 10).join(' ') };
  };

  /* ------------------------------------------------------------------ on-device transcription (Whisper)
     Runs transformers.js in a web worker. The model (~40-75 MB) downloads once from Hugging Face's CDN and the
     browser caches it; the audio itself never leaves the device. */
  var WORKER = [
    "import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';",
    "env.allowLocalModels = false;",
    "const cache = {};",
    "self.onmessage = async (e) => {",
    "  const { id, audio, model } = e.data;",
    "  try {",
    "    if (!cache[model]) cache[model] = await pipeline('automatic-speech-recognition', model, { progress_callback: (p) => self.postMessage({ id, type: 'load', p }) });",
    "    const asr = cache[model];",
    "    self.postMessage({ id, type: 'run' });",
    "    let out, level = 'word';",
    "    try { out = await asr(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 }); }",
    "    catch (err) { level = 'segment'; out = await asr(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 }); }",
    "    self.postMessage({ id, type: 'done', level, chunks: out.chunks || [], text: out.text || '' });",
    "  } catch (err) { self.postMessage({ id, type: 'error', error: String(err && err.message || err) }); }",
    "};"].join('\n');
  var worker = null, jobs = {}, jobSeq = 0;
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), { type: 'module' });
    worker.onmessage = function (e) { var j = jobs[e.data.id]; if (j) j(e.data); };
    worker.onerror = function (e) { Object.keys(jobs).forEach(function (k) { jobs[k]({ type: 'error', error: e.message || 'The caption helper couldn\'t start.' }); }); };
    return worker;
  }
  RS.MODELS = { en: 'onnx-community/whisper-tiny.en', multi: 'onnx-community/whisper-tiny' };
  /* ranges: [[s, e], ...] in source time. Resolves to words [[s, e, w], ...]. */
  RS.transcribe = function (m, ranges, lang, onProgress) {
    var prog = onProgress || function () {}, model = RS.MODELS[lang] || RS.MODELS.en;
    prog(0.02, 'Reading the sound…');
    return decodeMono(m.blob, 16000).then(function (au) {
      var words = [], i = 0;
      function nextRange() {
        if (i >= ranges.length) return words;
        var r = ranges[i], s = Math.max(0, r[0] - 0.3), e = Math.min(au.data.length / 16000, r[1] + 0.3);
        var audio = au.data.slice(Math.floor(s * 16000), Math.floor(e * 16000));
        return new Promise(function (res, rej) {
          var id = ++jobSeq;
          jobs[id] = function (msg) {
            if (msg.type === 'load') { if (msg.p && msg.p.status === 'progress' && msg.p.total) prog(0.05 + 0.35 * (msg.p.loaded / msg.p.total), 'Downloading the caption model (once)…'); }
            else if (msg.type === 'run') prog(0.45 + 0.5 * i / ranges.length, 'Listening and writing… (' + (i + 1) + '/' + ranges.length + ')');
            else if (msg.type === 'done') { delete jobs[id]; res(msg); }
            else if (msg.type === 'error') { delete jobs[id]; rej(new Error('On-device captions didn\'t work here: ' + msg.error)); }
          };
          getWorker().postMessage({ id: id, audio: audio, model: model }, [audio.buffer]);
        }).then(function (msg) {
          (msg.chunks || []).forEach(function (c) {
            var ts = c.timestamp || [], cs = (ts[0] || 0) + s, ce = (ts[1] == null ? (ts[0] || 0) + 0.4 : ts[1]) + s, txt = String(c.text || '').trim();
            if (!txt) return;
            if (msg.level === 'word' && txt.indexOf(' ') < 0) words.push([+cs.toFixed(3), +Math.max(cs + 0.05, ce).toFixed(3), txt.slice(0, 40)]);
            else words = words.concat(RS.spread(txt, cs, Math.max(cs + 0.3, ce)));
          });
          i++;
          return nextRange();
        });
      }
      return nextRange();
    });
  };
  /* Put new words into a transcript, replacing whatever was there in the same time ranges. */
  RS.mergeWords = function (old, fresh, ranges) {
    var keep = (old || []).filter(function (w) { return !ranges.some(function (r) { return w[0] >= r[0] - 0.3 && w[0] < r[1] + 0.3; }); });
    return keep.concat(fresh).sort(function (a, b) { return a[0] - b[0]; });
  };

  /* ------------------------------------------------------------------ storyboard ideas
     RS.suggestBoard(rows, style, plan): what could go on screen for each caption line (rows = RS.cues(...)). Simple rules,
     no AI and nothing leaves the device: a hook if there's none, tool labels on names (FFmpeg, yt-dlp, GitHub...), emoji
     on feeling words, a prompt bar on lines that give an instruction ("Ask...", "Make..."), big numbers as titles, and
     one line as a big title behind the person. Each idea: {row, kind, label, at, word, len, line} or {kind: 'hook', hook}. */
  var NOT_TOOLS = ('i im id ive ill the a an and but so or if then this that these those it its you your youre we they he she my our what when where why how ' +
    'who okay ok yes no oh well just now here there watch lets dont personally exactly also because before after today tomorrow monday tuesday wednesday ' +
    'thursday friday saturday sunday january february march april may june july august september october november december hey hi thanks').split(' ');
  var DO_VERBS = /^(ask|tell|make|give|use|write|create|draw|add|put|cut|turn|try|build|let|have|get|shrink|pop|grab|download|open|pick|start|stop|go)$/i;
  function bare(w) { return String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); }
  RS.suggestBoard = function (rows, st, plan) {
    var out = [], seen = {}, n = { label: 0, emoji: 0, prompt: 0, title: 0 }, layers = (st && st.layers) || [];
    function taken(at) { return layers.some(function (L) { return L.at != null && Math.abs(L.at - at) < 0.05; }); }
    if (!rows.length) return out;
    if (st && !st.hook) {
      var first = rows[0].text.split(/\s+/), hook = first.length <= 9 ? rows[0].text : first.slice(0, 7).join(' ') + '…';
      out.push({ row: 0, kind: 'hook', hook: hook.slice(0, 90), label: 'Hook: “' + hook.slice(0, 40) + '”' });
    }
    rows.forEach(function (r, i) {
      var ws = r.words, lineIdeas = 0;
      // a tool or brand name: CamelCase, a dash between letters, ALL CAPS, or Capitalised in the middle of a sentence
      for (var k = 0; k < ws.length && n.label < 4; k++) {
        var raw = String(ws[k][2]), w = bare(raw), lo = w.toLowerCase().replace(/['’]/g, '');
        if (w.length < 3 || seen[lo] || NOT_TOOLS.indexOf(lo) >= 0 || taken(ws[k][0])) continue;
        var prev = k ? String(ws[k - 1][2]) : (i ? rows[i - 1].text : '.');
        var startOfSentence = /[.!?…]$/.test(prev) || (!k && !i);
        var tool = /[a-z][A-Z]/.test(w) || /^\p{L}+-\p{L}+$/u.test(w) && /[a-z]/.test(w) && w.length <= 12 || /^[A-Z]{3,8}$/.test(w) || (/^[A-Z][a-z]+$/.test(w) && !startOfSentence);
        if (!tool) continue;
        seen[lo] = 1; n.label++; lineIdeas++;
        out.push({ row: i, kind: 'label', at: ws[k][0], word: w, len: 2.2, label: '🏷️ Label “' + w + '”' });
        break;
      }
      // feeling words get an emoji (only if captions aren't adding their own)
      if (!(st && st.capEmoji) && n.emoji < 4 && lineIdeas < 2) {
        for (var j = 0; j < ws.length; j++) {
          var em = RS.emojiFor(ws[j][2]);
          if (em && !taken(ws[j][0])) { n.emoji++; lineIdeas++; out.push({ row: i, kind: 'emoji', at: ws[j][0], word: bare(ws[j][2]), len: 1.6, label: em + ' on “' + bare(ws[j][2]) + '”' }); break; }
        }
      }
      // an instruction ("Ask Claude to...", "Make it moody...") becomes a prompt bar that types itself
      if (n.prompt < 2 && ws.length >= 4 && DO_VERBS.test(bare(ws[0][2])) && !taken(ws[0][0])) {
        n.prompt++; lineIdeas++;
        out.push({ row: i, kind: 'prompt', at: ws[0][0], word: bare(ws[0][2]), len: Math.min(4.5, Math.max(2.5, r.e - r.s + 0.8)), line: r.text.replace(/[.,!?]+$/, ''), label: '⌨️ Prompt bar with this line' });
      }
      // numbers ("15%", "97 bucks", "3x3") pop up as a big title
      if (n.title < 2 && lineIdeas < 2) {
        for (var q = 0; q < ws.length; q++) {
          var nw = bare(ws[q][2]);
          if (/\d/.test(nw) && !taken(ws[q][0])) { n.title++; out.push({ row: i, kind: 'title', at: ws[q][0], word: String(ws[q][2]).replace(/[.,!?;:]+$/, ''), len: 1.6, label: '✏️ Big “' + nw + '”' }); break; }
        }
      }
    });
    // one strong short line goes behind the person (an exclamation or question, else the shortest full line)
    var cand = rows.map(function (r, i) { return { r: r, i: i, n: r.words.length }; }).filter(function (c) { return c.n >= 2 && c.n <= 7; });
    var best = cand.filter(function (c) { return /[!?]$/.test(c.r.text); })[0] || cand.sort(function (a, b) { return a.n - b.n; })[0];
    if (best && !taken(best.r.words[0][0]) && !layers.some(function (L) { return L.behind; })) {
      out.push({ row: best.i, kind: 'behind', at: best.r.words[0][0], word: bare(best.r.words[0][2]), len: Math.min(3, Math.max(1.5, best.r.e - best.r.s + 0.3)),
        line: best.r.text.replace(/[.,!?…]+$/, ''), label: '🧍 This line behind you' });
    }
    out.sort(function (a, b) { return a.row - b.row; });
    return out;
  };
})();
