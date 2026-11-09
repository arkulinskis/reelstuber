/* rs-screens.js: Reelstuber's two editor screens, moved unchanged from the JavaScript version:
   project (web/pages/project.html: player + timeline, Find reels, chapters, captions, clip list, export all) and
   clip (web/pages/clip.html: the reel editor with its tabs). Components/Screen mounts them (rs-kit.js UI.mountScreen).
   Also RS.startProject / RS.startSample (from web/pages/home.html): open a video, make the project, go to it. */
(function () {
  var esc = UI.esc;
  function prettyName(name) {
    return String(name || 'My video').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'My video';
  }
  function busyModal(msg) {
    var m = UI.modal('<div class="st-busy"><span class="em">🎬</span><h2 style="padding:0">' + esc(msg) + '</h2><p class="muted" data-msg>Hang tight, this is all happening on your device.</p></div>');
    m.el.querySelector('.ui-modal-x').hidden = true;
    return m;
  }
  /* Start a project from a file (or the sample). Exposed for the landing page and tests. */
  RS.startProject = function (file, opts) {
    opts = opts || {};
    if (!file) return Promise.resolve();
    if (file.type && !/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name || '')) { UI.toast('That doesn\'t look like a video file.', 'error'); return Promise.resolve(); }
    var m = busyModal(opts.sample ? 'Unpacking the sample…' : 'Opening your video…');
    return RS.media.probe(file).then(function (meta) {
      return RS.db.createProject({ title: opts.title || prettyName(file.name), file_name: file.name || 'video', file_size: file.size, duration: meta.duration,
        width: meta.width, height: meta.height, thumb: meta.thumb, sample: !!opts.sample }, opts.transcript || null);
    }).then(function (p) {
      return RS.media.open(p.id, file, file.name).then(function () {
        if (!opts.sample) RS.media.keep(p.id, file);
        m.close();
        UI.go('project', p.id, 'find');
      });
    }).catch(function (e) { m.close(); UI.toast(e.message || 'That video didn\'t open.', 'error'); });
  };
  RS.startSample = function () {
    return RS.sample().then(function (s) {
      return RS.startProject(s.blob, { sample: true, title: s.transcript.title, transcript: { source: 'sample', words: s.transcript.words } });
    }, function (e) { UI.toast(e.message, 'error'); });
  };

})();
(function () {
  var esc = UI.esc;
  var COLORS = ['#FF3D8B', '#7B5CFF', '#C6F432', '#FFB23D', '#22E6D0', '#FF8FC1'];
  var LENGTHS = [15, 30, 45, 60, 90], COUNTS = [3, 5, 8, 12];

  UI.page('project', { title: 'Project' }, function (view, ctx) {
    var pid = ctx.args[0], autoFind = ctx.args[1] === 'find';
    var P = null, M = null, A = null, analyzing = null, sel = null, inT = null, outT = null, dead = false, raf = 0, stopAt = null, busy = false;
    var settings = { length: 30, count: 5, vibe: 'balanced', replace: true };
    var thumbImgs = [];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:60px;margin-bottom:18px"></div><div class="ui-skel" style="height:420px"></div></div>';

    function words() { return P.transcript && P.transcript.words || []; }
    function clipById(id) { return P.clips.filter(function (c) { return c.id === id; })[0]; }
    function thumbFor(t) {
      if (A && A.thumbs.length) { var best = A.thumbs[0]; A.thumbs.forEach(function (x) { if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x; }); return best.src; }
      return P.thumb || '';
    }
    function clipRow(c, i) {
      var st = RS.fullStyle(c.style), dur = c.end - c.start;
      var status = { draft: '<span class="ui-badge">Draft</span>', ready: '<span class="ui-badge lime">Ready</span>',
        exported: '<span class="ui-badge brand">' + UI.icon('check') + 'Exported' + (c.export_count > 1 ? ' ×' + c.export_count : '') + '</span>' }[c.status] || '';
      var th = thumbFor(c.start + Math.min(2, dur / 2));
      return '<div class="pj-clip' + (sel === c.id ? ' sel' : '') + '" data-clip="' + esc(c.id) + '">' +
        '<div class="th" style="' + (th ? 'background-image:url(' + esc(th) + ');background-position:' + Math.round(st.fx * 100) + '% 50%' : '') + '"><b>#' + (i + 1) + '</b></div>' +
        '<div style="min-width:0"><h4>' + esc(c.title || 'Clip') + '</h4><div class="meta"><span>' + RS.fmt(c.start) + '–' + RS.fmt(c.end) + ' · ' + Math.round(dur) + 's</span>' +
        (c.score != null ? '<span class="pj-score">' + Math.round(c.score) + '</span>' : '') + (c.label ? '<span>' + esc(c.label) + '</span>' : '') + status + '</div></div>' +
        '<div class="acts"><a class="ui-btn sm primary" href="#clip/' + esc(pid) + '/' + esc(c.id) + '" data-go="clip/' + esc(pid) + '/' + esc(c.id) + '">' + UI.icon('edit') + 'Edit</a>' +
        '<div class="pj-menu"><button class="ui-btn sm" data-more aria-label="More">' + UI.icon('more') + '</button></div></div></div>';
    }
    function chips(name, list, cur, fmt) {
      return '<div class="rs-chips">' + list.map(function (v) { return '<button type="button" class="rs-chip' + (String(v) === String(cur) ? ' on' : '') + '" data-set="' + name + '" data-v="' + v + '">' + (fmt ? fmt(v) : v) + '</button>'; }).join('') + '</div>';
    }
    function findCard() {
      var tooShort = P.duration < 8;
      return '<div class="ui-card pj-find" data-find><h3>' + UI.icon('wand') + 'Find reels</h3>' +
        '<div class="row"><span>Length</span>' + chips('length', LENGTHS, settings.length, function (v) { return v + 's'; }) + '</div>' +
        '<div class="row"><span>How many</span>' + chips('count', COUNTS, settings.count) + '</div>' +
        '<div class="row"><span>Vibe</span><div class="ui-seg">' + [['hype', '🔥 Hype'], ['balanced', '⚖️ Mix'], ['story', '💬 Story']].map(function (o) {
          return '<button type="button" data-set="vibe" data-v="' + o[0] + '" class="' + (settings.vibe === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
        (P.clips.some(function (c) { return c.source === 'auto'; }) ? RS.switchHtml('replace', 'Replace untouched drafts', settings.replace, 'Clips you edited, marked ready or exported always stay.') : '') +
        '<div data-run hidden class="pj-run"><b data-run-msg>Getting ready…</b><div class="rs-progress"><i data-run-bar></i></div></div>' +
        '<button class="ui-btn primary lg block" data-find-go style="margin-top:10px"' + (M && !tooShort ? '' : ' disabled') + '>' + UI.icon('sparkle') + (P.clips.length ? 'Find more reels' : 'Find my reels') + '</button>' +
        (A && A.notes.length ? '<p class="ui-hint">' + esc(A.notes.join(' ')) + '</p>' : '') +
        (tooShort ? '<p class="ui-hint">This video is very short: add a clip by hand instead.</p>' : '') + '</div>';
    }
    function draw() {
      var exportable = P.clips.filter(function (c) { return c.status !== 'exported'; }).length;
      var tr = words().length;
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="pj-head"><a class="ui-btn sm ghost" href="#home" data-go="home">' + UI.icon('back') + 'Studio</a>' +
        '<div class="grow"><input class="pj-title" data-title value="' + esc(P.title) + '" maxlength="120" aria-label="Project name">' +
        '<div class="pj-meta"><span>' + RS.fmt(P.duration) + '</span><span>·</span><span>' + (P.width ? P.width + '×' + P.height : '') + '</span><span>·</span><span>' + RS.size(P.file_size) + '</span>' +
        (P.sample ? '<span class="rs-sticker">🍿 Sample</span>' : '') + '<span class="pj-cap ui-badge' + (tr ? ' lime' : '') + '">' + UI.icon('cc') + (tr ? UI.plural(tr, 'caption word') : 'No captions yet') + '</span></div></div>' +
        '<div class="pj-menu"><button class="ui-btn sm" data-pmore>' + UI.icon('more') + 'More</button></div></div>' +
        '<div class="pj-grid"><div>' +
        (M ? '<div class="pj-stage"><div class="pj-video" data-video><button class="big-play" data-play-big aria-label="Play">' + UI.icon('play') + '</button></div>' +
          '<div class="pj-tl-wrap"><span data-tl-msg hidden>Reading your video…</span><canvas class="pj-tl" data-tl></canvas><div class="pj-ctrl">' +
          '<button class="ui-btn sm" data-play aria-label="Play or pause">' + UI.icon('play') + '</button><span class="pj-time" data-time>0:00 / ' + RS.fmt(P.duration) + '</span>' +
          '<span class="ui-spacer"></span><button class="ui-btn sm" data-in>[ In</button><button class="ui-btn sm" data-out>Out ]</button>' +
          '<button class="ui-btn sm lime" data-add>' + UI.icon('plus') + 'Add clip</button></div>' +
          '<div class="pj-ctrl"><button class="ui-btn sm" data-chapters>' + UI.icon('list') + 'Chapters → clips</button><button class="ui-btn sm" data-captions>' + UI.icon('cc') + 'Captions</button>' +
          '<span class="ui-spacer"></span><span class="rs-lock">' + UI.icon('lock') + 'On this device</span></div></div></div>'
          : '<label class="pj-relink" data-relink><span class="em">📼</span><h3>Where\'s the video?</h3><p class="muted">Reelstuber never uploads your video, so it needs the file again on this device: <b>' +
            esc(P.file_name) + '</b> (' + RS.size(P.file_size) + ', ' + RS.fmt(P.duration) + '). Your clips and edits are safe.</p>' +
            '<span class="ui-btn primary">' + UI.icon('upload') + 'Choose the file</span><input type="file" accept="video/*,.mkv,.mov" data-relink-file hidden></label>') +
        '</div><div class="pj-side">' + findCard() +
        '<div><div class="pj-clips-head"><h3>Clips <span class="muted">(' + P.clips.length + ')</span></h3>' +
        (P.clips.length && M ? '<button class="ui-btn sm" data-export-all' + (exportable ? '' : ' disabled') + '>' + UI.icon('download') + 'Export all (' + exportable + ')</button>' : '') + '</div>' +
        (P.clips.length ? '<div class="pj-clips">' + P.clips.map(clipRow).join('') + '</div>'
          : '<div class="ui-empty">' + UI.icon('scissors') + '<h3>No clips yet</h3><p>Tap <b>Find my reels</b>, or mark In and Out on the timeline and add one.</p></div>') +
        '</div></div></div></div>';
      if (M) mountVideo();
      else wireRelink();
    }

    /* ---------- the source player + timeline */
    function mountVideo() {
      var box = view.querySelector('[data-video]'), v = M.el;
      v.controls = false; v.muted = false; v.playbackRate = 1;
      box.insertBefore(v, box.firstChild);
      if (A) { thumbImgs = A.thumbs.map(function (x) { var im = new Image(); im.onload = drawTl; im.src = x.src; return { t: x.t, im: im }; }); }
      var tl = view.querySelector('[data-tl]');
      function seekFromEvent(e) {
        var r = tl.getBoundingClientRect(), t = RS.clamp((e.clientX - r.left) / r.width, 0, 1) * P.duration;
        var hit = P.clips.filter(function (c) { return t >= c.start && t <= c.end; })[0];
        if (hit && e.type === 'pointerdown') select(hit.id, false);
        stopAt = null; RS.seek(v, t).then(drawTl);
      }
      var dragging = false;
      tl.addEventListener('pointerdown', function (e) { dragging = true; tl.setPointerCapture(e.pointerId); seekFromEvent(e); });
      tl.addEventListener('pointermove', function (e) { if (dragging) seekFromEvent(e); });
      tl.addEventListener('pointerup', function () { dragging = false; });
      v.onplay = v.onpause = function () { box.classList.toggle('playing', !v.paused); var b = view.querySelector('[data-play]'); if (b) b.innerHTML = UI.icon(v.paused ? 'play' : 'pause'); };
      v.onplay(); drawTl(); loop();
    }
    function loop() {
      if (dead) return;
      if (M && !M.el.paused) {
        if (stopAt != null && M.el.currentTime >= stopAt) { M.el.pause(); stopAt = null; }
        drawTl();
      }
      raf = requestAnimationFrame(loop);
    }
    function drawTl() {
      var tl = view.querySelector('[data-tl]'); if (!tl || !M) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1), W = tl.clientWidth * dpr, H = tl.clientHeight * dpr;
      if (tl.width !== W || tl.height !== H) { tl.width = W; tl.height = H; }
      var g = tl.getContext('2d'), D = P.duration, th = H * 0.56, dark = document.documentElement.classList.contains('ui-dark');
      g.clearRect(0, 0, W, H);
      g.fillStyle = dark ? '#2C1F4A' : '#FFEEDB'; g.fillRect(0, 0, W, H);
      if (thumbImgs.length) {
        var tw = th * 16 / 9, n = Math.ceil(W / tw);
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) * tw / W * D, best = thumbImgs[0];
          thumbImgs.forEach(function (x) { if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x; });
          if (best.im.complete && best.im.naturalWidth) g.drawImage(best.im, i * tw, 0, tw, th);
        }
        g.fillStyle = 'rgba(26,16,51,.25)'; g.fillRect(0, 0, W, th);
      } else {
        g.fillStyle = dark ? '#3A2B5C' : '#EADBC6'; g.fillRect(0, 0, W, th);
        g.fillStyle = dark ? '#C6B9DD' : '#5E5277'; g.font = '600 ' + Math.round(12 * dpr) + 'px "DM Sans"'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(analyzing ? (view.querySelector('[data-tl-msg]') || {}).textContent || 'Reading your video…' : 'Timeline', W / 2, th / 2);
      }
      if (A && A.env) {
        var base = H - 4 * dpr, hh = H - th - 8 * dpr;
        g.fillStyle = dark ? '#9C85FF' : '#7B5CFF';
        for (var x = 0; x < W; x += 2 * dpr) {
          var t0 = x / W * D, t1 = (x + 2 * dpr) / W * D, mx = 0;
          for (var tt = t0; tt < t1; tt += RS.HOP) mx = Math.max(mx, RS.levelAt(A, tt));
          var bh = Math.max(1 * dpr, mx * hh);
          g.fillRect(x, base - bh, 1.4 * dpr, bh);
        }
        g.fillStyle = dark ? '#FFF4FA' : '#1A1033';
        (A.cuts || []).forEach(function (c) { g.fillRect(c / D * W - dpr / 2, th, dpr, 5 * dpr); });
      }
      P.clips.forEach(function (c, i) {
        var x0 = c.start / D * W, x1 = c.end / D * W, col = COLORS[i % COLORS.length];
        g.globalAlpha = sel === c.id ? 0.55 : 0.32; g.fillStyle = col; g.fillRect(x0, 0, Math.max(2, x1 - x0), H);
        g.globalAlpha = 1; g.fillStyle = col; g.fillRect(x0, 0, Math.max(2, x1 - x0), 5 * dpr);
        g.strokeStyle = '#1A1033'; g.lineWidth = (sel === c.id ? 3 : 1.5) * dpr; g.strokeRect(x0, 1, Math.max(2, x1 - x0), H - 2);
        g.fillStyle = '#1A1033'; g.font = '800 ' + Math.round(11 * dpr) + 'px "DM Sans"'; g.textAlign = 'left'; g.textBaseline = 'top';
        if (x1 - x0 > 18 * dpr) g.fillText('#' + (i + 1), x0 + 4 * dpr, 8 * dpr);
      });
      if (inT != null || outT != null) {
        var a = (inT != null ? inT : 0) / D * W, b = (outT != null ? outT : D) / D * W;
        g.fillStyle = 'rgba(198,244,50,.45)'; g.fillRect(a, 0, Math.max(2, b - a), H);
        g.fillStyle = '#1A1033'; if (inT != null) g.fillRect(a - dpr, 0, 2 * dpr, H); if (outT != null) g.fillRect(b - dpr, 0, 2 * dpr, H);
      }
      var px = M.el.currentTime / D * W;
      g.fillStyle = '#FF3D8B'; g.fillRect(px - 1.5 * dpr, 0, 3 * dpr, H);
      g.beginPath(); g.moveTo(px - 7 * dpr, 0); g.lineTo(px + 7 * dpr, 0); g.lineTo(px, 9 * dpr); g.closePath(); g.fill();
      var tm = view.querySelector('[data-time]'); if (tm) tm.textContent = RS.fmt(M.el.currentTime) + ' / ' + RS.fmt(D);
    }
    function select(id, play) {
      sel = id;
      view.querySelectorAll('[data-clip]').forEach(function (el) { el.classList.toggle('sel', el.getAttribute('data-clip') === id); });
      var c = clipById(id);
      if (c && M) {
        RS.seek(M.el, c.start).then(function () { drawTl(); if (play) { stopAt = c.end; M.el.play().catch(function () {}); } });
      }
      drawTl();
    }

    /* ---------- relink: the video isn't on this device */
    function wireRelink() {
      var box = view.querySelector('[data-relink]'), input = view.querySelector('[data-relink-file]');
      if (!box) return;
      function use(f) {
        if (!f) return;
        var go = function () {
          RS.media.open(pid, f, f.name).then(function (m) {
            M = m; RS.media.keep(pid, f);
            if (Math.abs(m.duration - P.duration) > 1.5) UI.toast('That file\'s length doesn\'t match the project, but we\'ll use it.', 'error');
            return RS.loadAnalysis(pid);
          }).then(function (a) { A = a; draw(); }, function (e) { UI.toast(e.message, 'error'); });
        };
        if (P.file_name && f.name !== P.file_name) {
          UI.confirm({ title: 'Use ' + f.name + '?', text: 'This project was made from ' + P.file_name + '. Clips keep their times, so the same video works best.', ok: 'Use it' })
            .then(function (yes) { if (yes) go(); });
        } else go();
      }
      input.addEventListener('change', function () { use(input.files[0]); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('over'); }); });
      box.addEventListener('drop', function (e) { use(e.dataTransfer && e.dataTransfer.files[0]); });
    }

    /* ---------- Find reels */
    var MSGS = ['Listening for the loud bits…', 'Hunting for punchlines…', 'Spotting scene changes…', 'Ranking the bangers…'];
    function runFind() {
      if (busy || !M) return Promise.resolve();
      busy = true;
      var card = view.querySelector('[data-find]'), run = card.querySelector('[data-run]'), bar = card.querySelector('[data-run-bar]'), msg = card.querySelector('[data-run-msg]'), btn = card.querySelector('[data-find-go]');
      run.hidden = false; btn.disabled = true;
      function prog(f, m) { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = m || MSGS[Math.floor(f * 3.9)]; }
      if (analyzing) { prog(0.3, 'Still reading your video…'); analyzing.holder.onProgress = prog; }
      return (A ? Promise.resolve(A) : (analyzing || startAnalysis(prog))).then(function (a) {
        A = a; prog(1, 'Ranking the bangers…');
        var found = RS.findClips(A, words(), settings);
        if (!found.length) throw Object.assign(new Error('We couldn\'t find good moments for that length. Try a shorter length.'), { uiApi: true });
        var clips = found.map(function (c) { return Object.assign(c, { style: RS.styleFor({ hook: c.hook }) }); });
        clips.forEach(function (c) { delete c.hook; });
        var replace = settings.replace && P.clips.some(function (c) { return c.source === 'auto'; });
        RS.db.updateProject(pid, { settings: { length: String(settings.length), count: String(settings.count), vibe: settings.vibe } }).catch(function () {});
        return RS.db.addClips(pid, clips, replace);
      }).then(function (r) {
        busy = false;
        P.clips = r.clips; sel = r.added[0] || null;
        draw();
        RS.confetti(90);
        UI.toast('Found ' + UI.plural(r.added.length, 'reel') + '! Tap Edit to make one yours.', 'ok');
      }, function (e) {
        busy = false;
        if (view.isConnected) { run.hidden = true; btn.disabled = false; }
        throw e;
      });
    }
    RS._findForTests = function () { return runFind(); };
    /* Read the video once (sound + pictures) so the timeline and thumbnails show up. Runs quietly in the background. */
    function startAnalysis(prog) {
      var holder = { onProgress: prog || null };
      analyzing = RS.analyze(M, function (f, m) {
        if (holder.onProgress) holder.onProgress(f, m);
        var lbl = view.querySelector('[data-tl-msg]'); if (lbl) lbl.textContent = 'Reading your video… ' + Math.round(f * 100) + '%';
      }).then(function (a) {
        analyzing = null; A = a;
        if (!dead && !busy) {
          thumbImgs = A.thumbs.map(function (x) { var im = new Image(); im.onload = drawTl; im.src = x.src; return { t: x.t, im: im }; });
          var list = view.querySelector('.pj-clips'); if (list) list.innerHTML = P.clips.map(clipRow).join('');
          drawTl();
        }
        return a;
      }, function (e) { analyzing = null; throw e; });
      analyzing.holder = holder;
      return analyzing;
    }

    /* ---------- adding clips by hand, chapters */
    function addClip() {
      var v = M.el, L = settings.length;
      var s = inT != null ? inT : v.currentTime, e = outT != null && outT > s + 1 ? outT : Math.min(P.duration, s + L);
      if (e - s < 1) { UI.toast('Move the playhead back a little: a clip needs at least 1 second.', 'error'); return; }
      var ws = RS.wordsIn(words(), s, e);
      var title = ws.length ? ws.slice(0, 6).map(function (w) { return w[2]; }).join(' ').replace(/[.,!?]+$/, '') : 'Clip at ' + RS.fmt(s);
      RS.db.addClips(pid, [{ start: +s.toFixed(2), end: +e.toFixed(2), title: title, source: 'manual', style: RS.styleFor() }]).then(function (r) {
        P.clips = r.clips; sel = r.added[0]; inT = outT = null; draw(); UI.toast('Clip added', 'ok');
      });
    }
    function chaptersModal() {
      var m = UI.modal('<h2>Chapters → clips</h2><p class="muted">Paste your video\'s chapter timestamps (like in a YouTube description). Each chapter becomes a clip.</p>' +
        '<form class="ui-stack" data-ch><textarea name="text" rows="7" placeholder="0:00 Intro&#10;0:12 The microwave story&#10;0:27 Pickle popcorn verdict"></textarea>' +
        '<label class="ui-field"><span>Clip length</span><select name="mode"><option value="first">First ' + settings.length + ' s of each chapter</option>' +
        '<option value="whole">The whole chapter (up to 3 minutes)</option></select></label>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary">' + UI.icon('scissors') + 'Make clips</button></div></form>');
      m.el.querySelector('[data-ch]').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = UI.formData(e.target), ch = RS.parseChapters(v.text, P.duration);
        if (!ch.length) { UI.toast('No timestamps found. Use lines like "1:23 Title".', 'error'); return; }
        var clips = ch.map(function (c) {
          var end = v.mode === 'whole' ? Math.min(c.end, c.start + 180) : Math.min(c.end, c.start + settings.length);
          return { start: c.start, end: end, title: c.title, label: '📑 Chapter', source: 'chapter', style: RS.styleFor({ hook: c.title }) };
        }).filter(function (c) { return c.end - c.start >= 1; });
        UI.busy(e.target.querySelector('.primary'), RS.db.addClips(pid, clips)).then(function (r) { m.close(); P.clips = r.clips; draw(); UI.toast('Made ' + UI.plural(r.added.length, 'clip') + ' from chapters', 'ok'); });
      });
    }

    /* ---------- captions for the whole project */
    function captionsModal() {
      var n = words().length, src = P.transcript && P.transcript.source;
      var m = UI.modal('<h2>Captions</h2><p class="muted">' + (n ? 'This project has <b>' + UI.plural(n, 'word') + '</b> of captions' + (src ? ' (' + esc({ whisper: 'written on this device', srt: 'from a subtitle file', sample: 'from the sample', manual: 'typed by you' }[src] || src) + ')' : '') + '.'
        : 'No captions yet. Pick a way to add them: they show up on every clip, word by word.') + '</p>' +
        '<div class="ui-stack"><div class="ui-card flat tight"><h4>' + UI.icon('wand') + ' Write them on this device <span class="ui-badge">beta</span></h4>' +
        '<p class="small muted">Speech-to-text runs in your browser. The first time, it downloads a small model (about 40 MB). Your sound never leaves this device.</p>' +
        '<div class="ui-row"><select data-lang style="max-width:200px"><option value="en">English</option><option value="multi">Another language</option></select>' +
        '<select data-scope style="max-width:220px"><option value="clips">Just my clips (' + P.clips.length + ')</option>' + (P.duration <= 1200 ? '<option value="all">The whole video</option>' : '') + '</select>' +
        '<button class="ui-btn primary" data-tx' + (M && (P.clips.length || P.duration <= 1200) ? '' : ' disabled') + '>' + UI.icon('wand') + 'Start</button></div>' +
        '<div data-tx-run hidden class="pj-run"><b data-tx-msg>Starting…</b><div class="rs-progress"><i data-tx-bar></i></div></div></div>' +
        '<div class="ui-card flat tight"><h4>' + UI.icon('upload') + ' Import a subtitle file</h4><p class="small muted">An .srt or .vtt file (YouTube Studio → Subtitles → Download). Replaces what\'s here.</p>' +
        '<label class="ui-btn">' + UI.icon('upload') + 'Choose .srt / .vtt<input type="file" accept=".srt,.vtt,text/vtt" data-subs hidden></label></div>' +
        (n ? '<button class="ui-btn danger" data-clear>' + UI.icon('trash') + 'Remove all captions</button>' : '') + '</div>');
      var el = m.el;
      el.querySelector('[data-subs]').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        f.text().then(function (txt) {
          var ws = RS.parseSubs(txt);
          if (!ws.length) throw Object.assign(new Error('No captions found in that file.'), { uiApi: true });
          return saveWords(ws, 'srt').then(function () { m.close(); UI.toast('Imported ' + UI.plural(ws.length, 'word'), 'ok'); });
        });
      });
      var clr = el.querySelector('[data-clear]');
      if (clr) clr.onclick = function () { saveWords([], 'manual').then(function () { m.close(); UI.toast('Captions removed'); }); };
      el.querySelector('[data-tx]').onclick = function (e) {
        var btn = e.currentTarget, lang = el.querySelector('[data-lang]').value, scope = el.querySelector('[data-scope]').value;
        var ranges = scope === 'all' ? [[0, P.duration]] : mergeRanges(P.clips.map(function (c) { return [c.start, c.end]; }));
        if (scope === 'all') { ranges = []; for (var t = 0; t < P.duration; t += 60) ranges.push([t, Math.min(P.duration, t + 60)]); }
        var run = el.querySelector('[data-tx-run]'), bar = el.querySelector('[data-tx-bar]'), msg = el.querySelector('[data-tx-msg]');
        run.hidden = false; btn.disabled = true;
        RS.transcribe(M, ranges, lang, function (f, t) { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = t; }).then(function (ws) {
          return saveWords(RS.mergeWords(words(), ws, ranges), 'whisper').then(function () { m.close(); UI.toast('Captions ready: ' + UI.plural(ws.length, 'word'), 'ok'); RS.confetti(60); });
        }).catch(function (err) { run.hidden = true; btn.disabled = false; UI.toast(err.message, 'error'); });
      };
    }
    function mergeRanges(rs) {
      rs.sort(function (a, b) { return a[0] - b[0]; });
      var out = [];
      rs.forEach(function (r) { var l = out[out.length - 1]; if (l && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); });
      return out;
    }
    function saveWords(ws, source) {
      var tr = { source: source, words: ws };
      return RS.db.updateProject(pid, { transcript: tr }).then(function () { P.transcript = tr; draw(); });
    }

    /* ---------- menus */
    function popMenu(anchor, items) {
      view.querySelectorAll('.pj-pop').forEach(function (x) { x.remove(); });
      var pop = document.createElement('div'); pop.className = 'pj-pop';
      pop.innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '" class="' + (it.danger ? 'danger' : '') + '">' + UI.icon(it.icon) + esc(it.label) + '</button>'; }).join('');
      anchor.parentNode.appendChild(pop);
      pop.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (!b) return; e.stopPropagation(); pop.remove(); items[+b.getAttribute('data-i')].go(); });
      setTimeout(function () { document.addEventListener('click', function off() { pop.remove(); document.removeEventListener('click', off); }); }, 0);
    }
    function clipMenu(btn, c) {
      popMenu(btn, [
        { icon: 'play', label: 'Play it here', go: function () { select(c.id, true); } },
        { icon: 'check', label: c.status === 'ready' ? 'Back to draft' : 'Mark ready', go: function () {
          RS.db.saveClip(c.id, { status: c.status === 'ready' ? 'draft' : 'ready' }).then(function (nc) { Object.assign(c, nc); draw(); }); } },
        { icon: 'copy', label: 'Duplicate', go: function () { RS.db.duplicateClip(c.id).then(function (r) { P.clips = r.clips; draw(); UI.toast('Duplicated', 'ok'); }); } },
        { icon: 'trash', label: 'Delete clip', danger: true, go: function () {
          UI.confirm({ title: 'Delete "' + c.title + '"?', text: 'The clip and its edits are removed. Your video isn\'t touched.', ok: 'Delete', danger: true }).then(function (yes) {
            if (yes) RS.db.deleteClip(c.id).then(function () { P.clips = P.clips.filter(function (x) { return x.id !== c.id; }); draw(); });
          }); } }
      ]);
    }
    function projectMenu(btn) {
      popMenu(btn, [
        { icon: 'cc', label: 'Captions', go: captionsModal },
        { icon: 'list', label: 'Chapters → clips', go: chaptersModal },
        { icon: 'trash', label: 'Delete project', danger: true, go: function () {
          UI.confirm({ title: 'Delete this project?', text: 'All its clips and edits are deleted, and the copy of the video kept in this browser. Your original file isn\'t touched.', ok: 'Delete', danger: true })
            .then(function (yes) { if (yes) RS.db.deleteProject(pid).then(function () { RS.media.forget(pid); UI.toast('Project deleted'); UI.go('home'); }); });
        } }
      ]);
    }

    /* ---------- export all */
    function exportAll() {
      var list = P.clips.filter(function (c) { return c.status !== 'exported'; });
      if (!list.length) return;
      var signal = { aborted: false };
      var m = UI.modal('<h2>Export ' + UI.plural(list.length, 'reel') + '</h2><p class="muted">Each reel plays through once while it records, so this takes about as long as the clips. Keep this tab open.</p>' +
        '<label class="ui-field"><span>Quality</span><select data-q><option value="1080">Full HD (1080p)</option><option value="720">Faster (720p)</option></select></label>' +
        '<div class="pj-queue">' + list.map(function (c, i) { return '<div class="q" data-q-i="' + i + '"><span class="ui-badge">#' + (P.clips.indexOf(c) + 1) + '</span><span class="grow">' + esc(c.title) + '</span><span data-q-st class="small muted">' + Math.round(c.end - c.start) + 's</span></div>'; }).join('') + '</div>' +
        '<canvas class="pj-exp-canvas" data-cv hidden></canvas><div class="rs-progress" data-bar-box hidden><i data-bar></i></div>' +
        '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Close</button><button class="ui-btn primary" data-go-all>' + UI.icon('download') + 'Start</button></div>',
        { onclose: function () { signal.aborted = true; } });
      var el = m.el, cv = el.querySelector('[data-cv]');
      el.querySelector('[data-go-all]').onclick = function (e) {
        var q = el.querySelector('[data-q]').value, btn = e.currentTarget; btn.disabled = true;
        cv.hidden = false; el.querySelector('[data-bar-box]').hidden = false;
        var i = 0, made = 0, badges = [];
        (function next() {
          if (i >= list.length || signal.aborted) {
            if (!signal.aborted) { UI.toast('Exported ' + UI.plural(made, 'reel') + '!', 'ok'); RS.confetti(); RS.badgeToast(badges); m.close(); }
            draw(); return;
          }
          var c = list[i], row = el.querySelector('[data-q-i="' + i + '"]');
          row.classList.add('on'); row.querySelector('[data-q-st]').textContent = 'recording…';
          var plan = RS.plan(c, words(), A);
          RS.exportClip(M, plan, { quality: q, signal: signal, onProgress: function (f, canvas) {
            el.querySelector('[data-bar]').style.width = Math.round(f * 100) + '%';
            var r = 300 / canvas.height; cv.width = Math.round(canvas.width * r); cv.height = 300; cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height);
          } }).then(function (out) {
            RS.download(out.blob, RS.slug(c.title) + '.' + out.ext);
            row.querySelector('[data-q-st]').textContent = '✓ done';
            made++;
            return RS.db.logExport(c.id, { seconds: out.seconds, format: out.ext }).then(function (r) { Object.assign(c, r.clip); badges = badges.concat(r.new_badges || []); });
          }).then(function () { i++; next(); }, function (err) {
            row.querySelector('[data-q-st]').textContent = err.cancelled ? 'stopped' : 'failed';
            if (!err.cancelled) UI.toast(err.message, 'error');
            i++; next();
          });
        })();
      };
    }

    /* ---------- events */
    view.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-play],[data-play-big]')) { stopAt = null; M.el.paused ? M.el.play().catch(function () {}) : M.el.pause(); return; }
      if (t.closest('[data-in]')) { inT = M.el.currentTime; if (outT != null && outT <= inT) outT = null; drawTl(); return; }
      if (t.closest('[data-out]')) { outT = M.el.currentTime; if (inT != null && inT >= outT) inT = null; drawTl(); return; }
      if (t.closest('[data-add]')) { addClip(); return; }
      if (t.closest('[data-chapters]')) { chaptersModal(); return; }
      if (t.closest('[data-captions]')) { captionsModal(); return; }
      if (t.closest('[data-export-all]')) { exportAll(); return; }
      if (t.closest('[data-find-go]')) { runFind().catch(function (err) { UI.toast(err.message, 'error'); }); return; }
      if (t.closest('[data-pmore]')) { e.stopPropagation(); projectMenu(t.closest('[data-pmore]')); return; }
      var set = t.closest('[data-set]');
      if (set) {
        var k = set.getAttribute('data-set'), v = set.getAttribute('data-v');
        settings[k] = k === 'vibe' ? v : +v;
        set.parentNode.querySelectorAll('[data-set]').forEach(function (b) { b.classList.toggle('on', b === set); });
        return;
      }
      var more = t.closest('[data-more]');
      if (more) { e.stopPropagation(); clipMenu(more, clipById(more.closest('[data-clip]').getAttribute('data-clip'))); return; }
      var row = t.closest('[data-clip]');
      if (row && !t.closest('a,button')) select(row.getAttribute('data-clip'), false);
    });
    view.addEventListener('change', function (e) {
      if (e.target.matches('[data-k="replace"]')) settings.replace = e.target.checked;
    });
    view.addEventListener('keydown', function (e) { if (e.target.matches('[data-title]') && e.key === 'Enter') e.target.blur(); });
    view.addEventListener('focusout', function (e) {
      if (!e.target.matches('[data-title]')) return;
      var v = e.target.value.trim();
      if (!v) { e.target.value = P.title; return; }
      if (v !== P.title) RS.db.updateProject(pid, { title: v }).then(function () { P.title = v; UI.toast('Renamed', 'ok'); });
    });
    var onResize = RS.debounce(drawTl, 100);
    window.addEventListener('resize', onResize);
    function onKey(e) {
      if (!M || e.target.closest('input,textarea,select') || document.querySelector('.ui-modal-wrap')) return;
      if (e.key === ' ') { e.preventDefault(); M.el.paused ? M.el.play().catch(function () {}) : M.el.pause(); }
      else if (e.key === 'i') view.querySelector('[data-in]').click();
      else if (e.key === 'o') view.querySelector('[data-out]').click();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { RS.seek(M.el, M.el.currentTime + (e.key === 'ArrowLeft' ? -5 : 5)).then(drawTl); }
    }
    document.addEventListener('keydown', onKey);

    var ready = RS.db.project(pid).then(function (p) {
      P = p;
      if (P.settings) {
        if (+P.settings.length) settings.length = +P.settings.length;
        if (+P.settings.count) settings.count = +P.settings.count;
        if (P.settings.vibe) settings.vibe = P.settings.vibe;
      }
      return RS.media.restore(P).catch(function () { return null; });
    }).then(function (m) {
      M = m;
      return M ? RS.loadAnalysis(pid) : null;
    }).then(function (a) {
      A = a;
      draw();
      if (M && !P.thumb) RS.seek(M.el, Math.min(P.duration * 0.15, 6)).then(function () {
        var th = RS.frameThumb(M.el, 192); if (th) { P.thumb = th; RS.db.updateProject(pid, { thumb: th }).catch(function () {}); }
        return RS.seek(M.el, 0);
      }).then(drawTl);
      if (M && !A && !(autoFind && !P.clips.length)) startAnalysis().catch(function (e) { console.warn('analysis', e); });
      if (autoFind && M && !P.clips.length) { history.replaceState(null, '', '#project/' + encodeURIComponent(pid)); runFind().catch(function (err) { UI.toast(err.message, 'error'); }); }
    });
    return { ready: ready, destroy: function () {
      dead = true; cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey);
      if (M) { M.el.pause(); M.el.onplay = M.el.onpause = null; }
    } };
  });
})();
(function () {
  var esc = UI.esc;
  var TABS = [['look', 'Look', 'palette'], ['captions', 'Captions', 'cc'], ['text', 'Text', 'type'], ['stickers', 'Stickers', 'smile'], ['fx', 'FX', 'sparkle'],
    ['sound', 'Sound', 'music'], ['post', 'Post', 'share']];
  var SHAPE_COLOR = { arrow: '#FF3D8B', ring: '#FF3B3B', underline: '#FFE14D', sparkles: '#FFE14D', heart: '#FF3D8B', star: '#FFE14D' };
  var CAP_STYLES = [['clean', '🤍 Clean'], ['pop', '💥 Pop'], ['karaoke', '🎤 Karaoke'], ['boxed', '📦 Boxed'], ['minimal', '🫧 Minimal'], ['neon', '🌙 Neon'], ['comic', '🗯️ Comic']];
  var FONTS = RS.FONTS;
  RS.musicFiles = RS.musicFiles || {};
  RS.pipFiles = RS.pipFiles || {};  // clip id -> {file, url, el}: the picture-in-picture video, kept on this device only
  var lastTab = 'look';

  UI.page('clip', { title: 'Edit reel' }, function (view, ctx) {
    var pid = ctx.args[0], cid = ctx.args[1];
    var P, C, st, M, A, plan, player, tab = lastTab, dead = false, postSeed = 0, exporting = false, selId = null, boxes = [], wallFrames = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:56px;margin-bottom:16px"></div><div class="ui-skel" style="height:520px"></div></div>';
    function words() { return P.transcript && P.transcript.words || []; }
    function replan() {
      plan = RS.plan(C, words(), A);
      plan.pipSrc = st.layout === 'pip' ? pipVid() : null;
      plan.wall = st.wall ? wallFrames : null;
      // layers pinned to a word: keep their start in step with where that word now lands in the reel
      (st.layers || []).forEach(function (L) {
        if (L.at == null || L.all) return;
        var sp = RS.layerSpan(L, plan); if (sp[0] < 0) return;
        var len = Math.max(0.3, L.e - L.s); L.s = +sp[0].toFixed(2); L.e = +(sp[0] + len).toFixed(2);
      });
    }
    function pipVid() { var x = RS.pipFiles[C.id]; return x ? x.el : null; }
    function setPipFile(f) {
      var old = RS.pipFiles[C.id];
      if (old) { try { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); } catch (e) {} URL.revokeObjectURL(old.url); delete RS.pipFiles[C.id]; }
      if (!f) { set('pipName', '', true); return Promise.resolve(); }
      var url = URL.createObjectURL(f);
      return RS.videoEl(url).then(function (v) {
        v.muted = true; v.loop = true; RS.pipFiles[C.id] = { file: f, url: url, el: v };
        set('pipName', f.name.slice(0, 80), true);
      }, function (e) { URL.revokeObjectURL(url); UI.toast(e.message, 'error'); });
    }
    function loadWall() {
      if (!st.wall || !M) return;
      var D = P.duration, times = P.clips.filter(function (c) { return c.id !== C.id; }).map(function (c) { return (c.start + c.end) / 2; }).slice(0, 8);
      for (var k = 0; k < 16 && times.length < 8; k++) { var t = D * (k + 0.5) / 16; if (t < C.start || t > C.end) times.push(t); }
      while (times.length < 8) times.push(D * times.length / 8);
      RS.wallFrames(M, times).then(function (fr) { if (dead) return; wallFrames = fr; replan(); if (player) player.draw(); },
        function (e) { UI.toast('Couldn\'t read pictures for the wall: ' + e.message, 'error'); });
    }
    function needPerson(say) {
      if (RS.person.ready || !(st.layers || []).some(function (L) { return L.behind; })) return;
      if (say) UI.toast('🧍 Loading the person cut-out (first time only)…');
      RS.person.load().then(function () { if (!dead && player) player.draw(); if (say) UI.toast('Text now goes behind you ✓', 'ok'); }, function (e) { UI.toast(e.message, 'error'); });
    }
    function setSaved(t) { var el = view.querySelector('[data-saved]'); if (el) el.textContent = t; }
    var saveSoon = RS.debounce(function () {
      setSaved('Saving…');
      RS.db.saveClip(C.id, { title: C.title, start: C.start, end: C.end, style: st, post: C.post || {} }).then(function (nc) {
        C.status = nc.status; C.edited = true; setSaved('Saved ✓');
      }, function (e) { setSaved('Not saved'); UI.toast(e.message, 'error'); });
    }, 700);
    var saveWordsSoon = RS.debounce(function () { RS.db.updateProject(pid, { transcript: P.transcript }).catch(function (e) { UI.toast(e.message, 'error'); }); }, 900);
    function set(k, v, redraw) {
      st[k] = v; C.style = st; replan();
      if (player) player.draw();
      if (redraw) drawPanel();
      saveSoon();
    }

    /* ---------- text + stickers (st.layers) */
    function layerById(id) { return (st.layers || []).filter(function (L) { return L.id === id; })[0] || null; }
    function selLayer() { return selId ? layerById(selId) : null; }
    function tabFor(L) { return L.t === 'text' || L.t === 'card' ? 'text' : 'stickers'; }
    function layerLabel(L) {
      return L.t === 'shape' ? (RS.SHAPES.filter(function (x) { return x[0] === L.v; })[0] || ['', L.v])[1] : L.t === 'badge' ? '🏷️ ' + L.v : L.t === 'emoji' ? L.v :
        L.t === 'card' ? ({ label: '🏷️ ', repo: '📦 ', prompt: '⌨️ ' }[L.card] || '🪪 ') + L.v : '✏️ ' + String(L.v).replace(/\n/g, ' ');
    }
    function pinLayer(L, at, word) {
      var len = Math.max(0.3, (L.e - L.s) || 2), s0 = RS.srcToOut(plan, at);
      L.at = +(+at).toFixed(3); L.word = String(word || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').slice(0, 40); L.all = false;
      L.s = +s0.toFixed(2); L.e = +(s0 + len).toFixed(2);
    }
    function nowOut() { return M && plan ? RS.srcToOut(plan, M.el.currentTime) : 0; }
    function select(id) {
      selId = id; if (player) { player.opt.selected = id; player.draw(); }
      var L = selLayer();
      if (L && tabFor(L) !== tab) showTab(tabFor(L)); else drawPanel();
    }
    function layersChanged(redraw) { set('layers', st.layers, redraw); }
    /* pin = {at, word, len}: pin the new layer to a word. Returns false when the reel is full. */
    function placeLayer(L, pin) {
      st.layers = (st.layers || []).slice();
      if (st.layers.length >= 24) { UI.toast('That\'s the most text and stickers one reel can hold (24).', 'error'); return false; }
      var D = plan.outDur, len = Math.min(pin && pin.len || 3, D), t0 = RS.clamp(nowOut(), 0, Math.max(0, D - len));
      L.s = +t0.toFixed(2); L.e = +(t0 + len).toFixed(2);
      if (!L.behind && L.t !== 'card') {
        var n = st.layers.filter(function (x) { return x.t === L.t; }).length;
        L.y = RS.clamp(L.y + (n % 4) * 0.07, 0.08, 0.92); L.x = RS.clamp(L.x + ((n % 3) - 1) * 0.08 * (n ? 1 : 0), 0.1, 0.9);
      }
      if (pin) pinLayer(L, pin.at, pin.word);
      st.layers.push(L);
      return true;
    }
    function addLayer(L, pin) {
      if (!placeLayer(L, pin)) return;
      if (player) player.pause();
      layersChanged(false); select(L.id);
      if (L.behind) needPerson(true);
      if (pin && player) player.seekOut(Math.max(0, L.s - 0.4));
    }
    /* A ready-made layer for a word (the Captions word picker and the Storyboard). */
    function layerFor(kind, word, at, line) {
      var w = String(word || '').replace(/[.,!?;:"“”()]+/g, ''), em = RS.emojiFor(word) || '✨', cap = w.charAt(0).toUpperCase() + w.slice(1);
      if (kind === 'emoji') return { L: RS.newLayer('emoji', em, { y: 0.36 }), len: 1.6 };
      if (kind === 'title') return { L: RS.newLayer('text', w, { size: 1.4, rot: -4 }), len: 1.6 };
      if (kind === 'behind') return { L: RS.newLayer('text', line || w, { ts: 'plain', font: 'Anton', size: line ? 1.5 : 2.2, y: 0.2, rot: 0, behind: true, anim: 'zoom' }), len: 2.4 };
      if (kind === 'label') return { L: RS.newLayer('card', cap, { card: 'label', icon: em === '✨' ? '🧰' : em, fill: '#22C55E', upper: false }), len: 2.2 };
      if (kind === 'repo') return { L: RS.newLayer('card', w.toLowerCase() + '/' + w.toLowerCase(), { card: 'repo', sub: 'What ' + cap + ' does, in one line', icon: '📦', fill: '#2F81F7', upper: false }), len: 2.6 };
      if (kind === 'prompt') return { L: RS.newLayer('card', String(line || w).replace(/\s+/g, ' ').slice(0, 120), { card: 'prompt', anim: 'type', fill: '#D97757', upper: false }), len: 3.6 };
      return { L: RS.newLayer('badge', w.toUpperCase().slice(0, 24), { shape: 'burst', fill: '#FFE14D', rot: -6 }), len: 1.6 };
    }
    function lineAt(at) { var c = RS.cues(words(), C.start, C.end, 12).filter(function (x) { return at >= x.s - 0.01 && at < x.e; })[0]; return c ? c.text : ''; }
    function wordPopModal(at, word) {
      var w = String(word).replace(/[.,!?;:"“”()]+/g, ''), em = RS.emojiFor(word) || '✨';
      var opts = [['emoji', em + ' Emoji sticker'], ['title', '✏️ “' + w + '” as a title'], ['behind', '🧍 Title behind you'], ['label', '🏷️ Tool label'],
        ['repo', '📦 Repo card'], ['prompt', '⌨️ Prompt bar (this line)'], ['badge', '💥 Word sticker']];
      var m = UI.modal('<h2>On “' + esc(w) + '”</h2><p class="muted">Pops in the moment you say it, and follows the word if you trim the clip.</p><div class="ce-pop-opts">' +
        opts.map(function (o) { return '<button type="button" class="ui-btn" data-p="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>' +
        '<div class="ui-row end" style="margin-top:14px"><button type="button" class="ui-btn ghost" data-close>Cancel</button></div>');
      m.el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-p]'); if (!b) return;
        var k = b.getAttribute('data-p'), made = layerFor(k, w, at, k === 'prompt' ? lineAt(at) : '');
        m.close(); addLayer(made.L, { at: at, word: w, len: made.len });
      });
    }
    function setLayer(k, v, redraw) {
      var L = selLayer(); if (!L) return;
      if (k === 'len') L.e = +(L.s + v).toFixed(2);
      else if (k === 's') { var len = L.e - L.s; L.s = v; L.e = +(v + len).toFixed(2); delete L.at; delete L.word; }
      else L[k] = v;
      layersChanged(redraw);
    }
    function deleteLayer() {
      if (!selId) return;
      st.layers = st.layers.filter(function (L) { return L.id !== selId; });
      selId = null; if (player) player.opt.selected = null;
      layersChanged(true); UI.toast('Removed');
    }
    function lchips(k, list, cur) {
      return '<div class="rs-chips">' + list.map(function (v) {
        return '<button type="button" class="rs-chip' + (String(cur) === String(v[0]) ? ' on' : '') + '" data-lchip="' + k + '" data-v="' + esc(v[0]) + '">' + esc(v[1]) + '</button>'; }).join('') + '</div>';
    }
    function lrange(k, label, v, min, max, step, show) {
      return '<label class="rs-range"><span>' + esc(label) + '<b data-lshow="' + k + '">' + esc(show(v)) + '</b></span><input type="range" data-lk="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"></label>';
    }
    var LSHOW = { size: function (v) { return Math.round(v * 100) + '%'; }, rot: function (v) { return Math.round(v) + '°'; },
      s: function (v) { return (+v).toFixed(1) + 's'; }, len: function (v) { return (+v).toFixed(1) + 's'; } };
    function layerList(type) {
      var list = (st.layers || []).filter(function (L) { var tx = L.t === 'text' || L.t === 'card'; return type === 'text' ? tx : !tx; });
      if (!list.length) return '';
      return '<div class="ce-sec"><h4>On this reel (' + list.length + ')</h4><div class="ce-layers">' + list.map(function (L) {
        return '<button type="button" class="ce-lrow' + (L.id === selId ? ' on' : '') + '" data-sel="' + esc(L.id) + '"><span>' + esc(layerLabel(L)) + '</span><small>' +
          (L.behind ? '🧍 ' : '') + (L.all ? 'whole reel' : L.at != null && L.word ? '📌 “' + esc(L.word) + '”' : (+L.s).toFixed(1) + '–' + (+L.e).toFixed(1) + 's') + '</small></button>'; }).join('') + '</div></div>';
    }
    function layerEditor(L) {
      var D = Math.max(1, plan.outDur), isText = L.t === 'text', h = '';
      var head = isText ? '✏️ Edit text' : L.t === 'emoji' ? L.v + ' Edit sticker' : L.t === 'badge' ? '🏷️ Edit word sticker' : L.t === 'card' ? '🪪 Edit card' : '🖍️ Edit doodle';
      h += '<div class="ui-card ce-led ce-sec" data-led><div class="ce-led-head"><b>' + esc(head) + '</b>' +
        '<button type="button" class="ui-btn sm icon" data-ldup title="Duplicate" aria-label="Duplicate">' + UI.icon('copy') + '</button>' +
        '<button type="button" class="ui-btn sm danger icon" data-ldel title="Delete" aria-label="Delete">' + UI.icon('trash') + '</button>' +
        '<button type="button" class="ui-btn sm" data-ldone>' + UI.icon('check') + 'Done</button></div>';
      if (isText) {
        var tsName = { outline: 'Outline', double: 'Outer outline', pop3d: '3D side', hollow: 'Outline', glow: 'Glow', sticker: 'Box', marker: 'Highlighter', plain: 'Shadow', magazine: '' }[L.ts] || 'Outline';
        h += '<label class="ui-field"><span>Text</span><textarea data-lk="v" maxlength="120" rows="2">' + esc(L.v) + '</textarea></label>' +
          '<div><span class="ce-sub">Font</span><div class="ce-fonts">' + FONTS.map(function (f) {
            return '<button type="button" class="ce-font' + (L.font === f ? ' on' : '') + '" data-lchip="font" data-v="' + esc(f) + '" style="font-family:\'' + f + '\'">' + esc(f) + '</button>'; }).join('') + '</div></div>' +
          '<div><span class="ce-sub">Outline style</span>' + lchips('ts', RS.TEXT_STYLES.map(function (x) { return [x.key, x.name]; }), L.ts) + '</div>' +
          '<div class="ce-colors">' + (L.ts === 'hollow' ? '' : '<label>Fill<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label>') +
          (L.ts === 'plain' || L.ts === 'magazine' ? '' : '<label>' + tsName + '<input type="color" data-lk="line" value="' + esc(L.line) + '"></label>') + '</div>' +
          (L.ts === 'magazine' ? '<label class="ui-field"><span>Issue line (above the title)</span><input type="text" data-lk="sub" maxlength="60" value="' + esc(L.sub || '') + '" placeholder="No. 01 · November 2026 · The reel issue"></label>' : '') +
          '<label class="rs-switch"><span>ALL CAPS</span><input type="checkbox" data-lk="upper"' + (L.upper ? ' checked' : '') + '></label>';
      } else if (L.t === 'card') {
        var ck = L.card || 'label';
        h += '<div><span class="ce-sub">Kind</span>' + lchips('card', RS.CARDS.map(function (x) { return [x.key, x.name]; }), ck) + '</div>' +
          '<label class="ui-field"><span>' + (ck === 'prompt' ? 'Prompt text' : ck === 'repo' ? 'Repo name' : 'Name') + '</span>' +
          (ck === 'prompt' ? '<textarea data-lk="v" maxlength="120" rows="2">' + esc(L.v) + '</textarea>' : '<input type="text" data-lk="v" maxlength="60" value="' + esc(L.v) + '">') + '</label>' +
          (ck !== 'label' ? '<label class="ui-field"><span>' + (ck === 'repo' ? 'Description' : 'Small label above (optional)') + '</span><input type="text" data-lk="sub" maxlength="120" value="' + esc(L.sub || '') + '" placeholder="' + (ck === 'repo' ? 'What it does' : 'To Claude') + '"></label>' : '') +
          '<div class="ce-two">' + (ck !== 'prompt' ? '<label class="ui-field"><span>Icon (an emoji)</span><input type="text" data-lk="icon" maxlength="8" value="' + esc(L.icon || '') + '"></label>' : '') +
          '<div class="ce-colors"><label>Accent<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label></div></div>' +
          (ck === 'prompt' ? '<p class="ui-hint" style="margin:0">Pick the <b>⌨️ Type</b> entrance below and it types itself out.</p>' : '');
      } else if (L.t === 'badge') {
        h += '<label class="ui-field"><span>Words</span><input type="text" data-lk="v" maxlength="24" value="' + esc(L.v) + '"></label>' +
          '<div><span class="ce-sub">Shape</span>' + lchips('shape', [['burst', '💥 Burst'], ['pill', '💊 Pill'], ['bubble', '💬 Bubble'], ['circle', '⭕ Circle']], L.shape) + '</div>' +
          '<div class="ce-colors"><label>Colour<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label></div>';
      } else if (L.t === 'shape') {
        h += '<div><span class="ce-sub">Doodle</span>' + lchips('v', RS.SHAPES, L.v) + '</div>' +
          '<div class="ce-colors"><label>Colour<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label></div>';
      }
      h += '<div class="ce-two">' + lrange('size', 'Size', L.size, 0.3, 3, 0.05, LSHOW.size) + lrange('rot', 'Turn', L.rot, -180, 180, 1, LSHOW.rot) + '</div>' +
        '<div><span class="ce-sub">Comes in with</span>' + lchips('anim', RS.ANIMS.filter(function (a) { return isText || a[0] !== 'type'; }), L.anim) + '</div>' +
        '<div><span class="ce-sub">While on screen</span>' + lchips('loop', RS.LOOPS, L.loop) + '</div>' +
        '<label class="rs-switch"><span>🧍 Behind the person<small>Cuts the person out of the picture so this sits behind them. Works best with one person in the shot.' +
          (L.behind && RS.person.failed ? ' The cut-out didn\'t load: check your connection.' : '') + '</small></span><input type="checkbox" data-lk="behind"' + (L.behind ? ' checked' : '') + '></label>' +
        '<div><label class="rs-switch"><span>Show for the whole reel</span><input type="checkbox" data-lk="all"' + (L.all ? ' checked' : '') + '></label>' +
        (L.all ? '' : '<div class="ce-two">' + lrange('s', 'Starts at', Math.min(L.s, D), 0, +(D - 0.3).toFixed(1), 0.1, LSHOW.s) +
          lrange('len', 'Stays for', RS.clamp(L.e - L.s, 0.3, D), 0.3, +D.toFixed(1), 0.1, LSHOW.len) + '</div>' +
          '<div class="ui-row" style="margin-top:8px"><button type="button" class="ui-btn sm" data-lhere>' + UI.icon('timer') + 'Start at the playhead</button></div>') + '</div>' +
        pinHtml(L) +
        '<p class="ui-hint" style="margin:0">Drag it on the preview to move it. Drag the ↻ handle to resize and turn.</p></div>';
      return h;
    }
    function pinHtml(L) {
      var ws = RS.wordsIn(words(), C.start, C.end);
      if (!ws.length || L.all) return '';
      return '<div><span class="ce-sub">Pin to a word</span><div class="ce-words">' + ws.slice(0, 200).map(function (w) {
        var on = L.at != null && Math.abs(w[0] - L.at) < 0.005;
        return '<button type="button" class="ce-word' + (on ? ' on' : '') + '" data-lword="' + w[0] + '" data-wtext="' + esc(w[2]) + '">' + esc(w[2]) + '</button>'; }).join('') + '</div>' +
        '<p class="ui-hint" style="margin:6px 0 0">' + (L.at != null ? '📌 Pops in on “' + esc(L.word || '') + '” and follows that word if you trim the clip. <button type="button" class="ui-btn sm ghost" data-lunpin>Unpin</button>'
          : 'Tap a word and it pops in exactly when it\'s said.') + '</p></div>';
    }

    /* ---------- layout */
    function draw() {
      var idx = P.clips.indexOf(C), prev = P.clips[idx - 1], next = P.clips[idx + 1];
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ce-head"><a class="ui-btn sm ghost" href="#project/' + esc(pid) + '" data-go="project/' + esc(pid) + '">' + UI.icon('back') + 'Project</a>' +
        '<div class="grow"><input class="ce-title" data-title value="' + esc(C.title) + '" maxlength="100" aria-label="Clip name"></div>' +
        '<span class="ce-saved" data-saved></span>' +
        '<span class="ce-nav">' + (prev ? '<a class="ui-btn sm icon" title="Previous clip" href="#clip/' + esc(pid) + '/' + esc(prev.id) + '" data-go="clip/' + esc(pid) + '/' + esc(prev.id) + '">' + UI.icon('back') + '</a> ' : '') +
        '<span class="ui-badge">' + (idx + 1) + ' / ' + P.clips.length + '</span>' +
        (next ? ' <a class="ui-btn sm icon" title="Next clip" href="#clip/' + esc(pid) + '/' + esc(next.id) + '" data-go="clip/' + esc(pid) + '/' + esc(next.id) + '">' + UI.icon('arrow') + '</a>' : '') + '</span>' +
        '<button class="ui-btn" data-board title="Storyboard: every line and what\'s on screen">' + UI.icon('list') + '<span class="ce-hide-sm">Storyboard</span></button>' +
        '<button class="ui-btn primary" data-export' + (M ? '' : ' disabled') + '>' + UI.icon('download') + 'Export</button></div>' +
        '<div class="ce-grid"><div class="ce-left">' +
        (M ? '<div class="ce-phone"><canvas data-cv></canvas><span class="ce-hint" data-hint>Drag to reframe · tap text to edit</span></div>' +
          '<div class="ce-trans"><button class="ui-btn icon" data-pp aria-label="Play or pause">' + UI.icon('play') + '</button>' +
          '<input type="range" data-scrub min="0" max="1000" value="0" aria-label="Position"><span class="t" data-t>0:00 / 0:00</span></div>' +
          '<div class="ui-card ce-trim"><canvas data-trim></canvas><div class="row">' +
          '<span class="nudge">Start <button class="ui-btn sm icon" data-nudge="s,-0.25">‹</button><b data-sv>' + RS.fmt(C.start, true) + '</b><button class="ui-btn sm icon" data-nudge="s,0.25">›</button></span>' +
          '<span class="ui-badge lime" data-len></span>' +
          '<span class="nudge">End <button class="ui-btn sm icon" data-nudge="e,-0.25">‹</button><b data-ev>' + RS.fmt(C.end, true) + '</b><button class="ui-btn sm icon" data-nudge="e,0.25">›</button></span></div></div>'
          : '<div class="ui-card"><h3>📼 Video needed</h3><p class="muted">This clip\'s video isn\'t on this device. Open the project and choose the file again to preview and export.</p>' +
            '<a class="ui-btn primary" href="#project/' + esc(pid) + '" data-go="project/' + esc(pid) + '">Open the project</a></div>') +
        '</div><div><nav class="ui-tabs ce-tabs">' + TABS.map(function (t) {
          return '<button type="button" data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</button>'; }).join('') + '</nav>' +
        '<div class="ce-panel" data-panel></div></div></div></div>';
      drawPanel();
      if (M) mountPlayer();
    }

    /* ---------- the panels */
    function chips(k, list, fmt) {
      return '<div class="rs-chips">' + list.map(function (v) {
        var val = Array.isArray(v) ? v[0] : v, label = Array.isArray(v) ? v[1] : (fmt ? fmt(v) : v);
        return '<button type="button" class="rs-chip' + (String(st[k]) === String(val) ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(val) + '">' + esc(label) + '</button>';
      }).join('') + '</div>';
    }
    function color(k, label) { return '<label>' + esc(label) + '<input type="color" data-k="' + k + '" value="' + esc(st[k]) + '"></label>'; }
    function field(k, label, ph, max) { return '<label class="ui-field"><span>' + esc(label) + '</span><input type="text" data-k="' + k + '" value="' + esc(st[k] || '') + '" placeholder="' + esc(ph || '') + '" maxlength="' + (max || 60) + '"></label>'; }
    var pct = function (v) { return Math.round(v * 100) + '%'; }, times = function (v) { return (+v).toFixed(2).replace(/0$/, '') + '×'; };
    var PANELS = {
      look: function () {
        return '<div class="ce-sec"><h4>Looks</h4><div class="ce-looks">' + RS.LOOKS.map(function (l) {
          return '<button type="button" class="ce-look' + (st.look === l.key ? ' on' : '') + '" data-look="' + l.key + '"><canvas data-look-cv="' + l.key + '"></canvas>' + l.emoji + ' ' + esc(l.name) + '</button>'; }).join('') + '</div>' +
          '<div class="ui-row" style="margin-top:12px"><button class="ui-btn sm" data-templates>' + UI.icon('grid') + 'Community templates</button>' +
          (UI.me ? '<button class="ui-btn sm" data-share-tpl>' + UI.icon('share') + 'Share this look</button>' : '') + '</div></div>' +
          '<div class="ce-sec"><h4>Shape</h4>' + chips('aspect', [['9:16', '9:16 Reels · TikTok · Shorts'], ['4:5', '4:5 Feed'], ['1:1', '1:1 Square'], ['16:9', '16:9 Wide']]) + '</div>' +
          '<div class="ce-sec"><h4>Layout</h4><div class="ce-layouts">' + [['fill', 'Fill'], ['fit', 'Fit + blur'], ['framed', 'Framed'], ['split', 'Split'], ['pip', 'Corner card']].map(function (l) {
            return '<button type="button" class="ce-layout' + (st.layout === l[0] ? ' on' : '') + '" data-layout data-v="' + l[0] + '"><i></i>' + l[1] + '</button>'; }).join('') + '</div></div>' +
          '<div class="ce-sec"><h4>' + (st.layout === 'split' ? 'Top half' : 'Framing') + '</h4><div class="ce-two">' +
          RS.rangeHtml('zoom', 'Zoom', st.zoom, 1, 3, 0.01, times) + RS.rangeHtml('fx', 'Left ↔ right', st.fx, 0, 1, 0.01, pct) + RS.rangeHtml('fy', 'Up ↕ down', st.fy, 0, 1, 0.01, pct) +
          (st.layout === 'split' ? RS.rangeHtml('split', 'Top size', st.split, 0.3, 0.7, 0.01, pct) : '') + '</div>' +
          '<p class="ui-hint">Tip: drag the preview to move the picture, scroll or pinch to zoom.</p></div>' +
          (st.layout === 'split' ? '<div class="ce-sec"><h4>Bottom half</h4><div class="ce-two">' + RS.rangeHtml('zoom2', 'Zoom', st.zoom2, 1, 3, 0.01, times) +
            RS.rangeHtml('fx2', 'Left ↔ right', st.fx2, 0, 1, 0.01, pct) + RS.rangeHtml('fy2', 'Up ↕ down', st.fy2, 0, 1, 0.01, pct) + '</div></div>' : '') +
          (st.layout === 'framed' ? '<div class="ce-sec"><h4>Background</h4><div class="ce-colors">' + color('bg', 'Colour') + '</div></div>' : '') +
          (st.layout === 'pip' ? '<div class="ce-sec"><h4>Corner card</h4>' + chips('pipPos', [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right']]) +
            '<div class="ce-two" style="margin-top:10px">' + RS.rangeHtml('pipSize', 'Card size', st.pipSize, 0.25, 0.6, 0.01, pct) + RS.rangeHtml('zoom2', 'Zoom', st.zoom2, 1, 3, 0.01, times) +
            RS.rangeHtml('fx2', 'Left ↔ right', st.fx2, 0, 1, 0.01, pct) + RS.rangeHtml('fy2', 'Up ↕ down', st.fy2, 0, 1, 0.01, pct) + '</div>' +
            '<div class="ui-row" style="margin-top:10px"><label class="ui-btn sm">' + UI.icon('film') + (pipVid() ? 'Change the card video' : 'Use another video') + '<input type="file" accept="video/*" data-pipfile hidden></label>' +
            (pipVid() ? '<span class="ui-badge lime">🎞️ ' + esc(st.pipName.slice(0, 36)) + '</span><button type="button" class="ui-btn sm ghost" data-pip-x>' + UI.icon('x') + 'Back to this video</button>'
              : st.pipName ? '<span class="small muted">Last time: ' + esc(st.pipName) + ' (choose it again)</span>' : '') + '</div>' +
            '<p class="ui-hint">The card shows a second crop of this video (great for a face cam), or another video from this device, like the clip you\'re reacting to. It plays muted and stays on this device.</p></div>' : '') +
          '<div class="ce-sec"><h4>Colour</h4><div class="ce-grades">' + RS.GRADES.map(function (gr) {
            return '<button type="button" class="ce-grade' + (st.grade === gr[0] ? ' on' : '') + '" data-grade="' + gr[0] + '"><canvas data-grade-cv="' + gr[0] + '"></canvas>' + esc(gr[1]) + '</button>'; }).join('') + '</div>' +
            (st.grade !== 'none' ? '<div style="margin-top:12px">' + RS.rangeHtml('gradeAmt', 'Strength', st.gradeAmt, 0.1, 1, 0.05, pct) +
              RS.switchHtml('gradeWipe', 'Before / after slider', st.gradeWipe, 'A slider sweeps across in the first 2 seconds to show off the change.') + '</div>' : '') + '</div>' +
          '<div class="ce-sec">' + RS.switchHtml('punch', 'Punch-in zoom', st.punch, 'Zooms in a touch on the loudest moments.') + '</div>';
      },
      captions: function () {
        var cues = RS.cues(words(), C.start, C.end, 8);
        return '<div class="ce-sec">' + RS.switchHtml('captions', 'Show captions', st.captions, 'Word-by-word, animated. Most people watch on mute!') + '</div>' +
          (!cues.length ? '<div class="ce-callout"><p>No caption words in this clip yet.</p><div class="ui-row">' +
            '<button class="ui-btn sm primary" data-tx' + (M ? '' : ' disabled') + '>' + UI.icon('wand') + 'Write them on this device</button>' +
            '<label class="ui-btn sm">' + UI.icon('upload') + 'Import .srt / .vtt<input type="file" accept=".srt,.vtt" data-subs hidden></label>' +
            '<button class="ui-btn sm" data-cue-add>' + UI.icon('type') + 'Type them</button></div>' +
            '<div data-tx-run hidden class="pj-run" style="margin-top:10px"><b data-tx-msg>Starting…</b><div class="rs-progress"><i data-tx-bar></i></div></div></div>' : '') +
          '<div class="ce-sec"><h4>Style</h4>' + chips('capStyle', CAP_STYLES) + (st.capStyle === 'clean' ? '<p class="ui-hint">Plain text with a soft shadow, no box: the cleanest look.</p>' : '') + '</div>' +
          '<div class="ce-sec"><div class="ce-two"><label class="ui-field"><span>Font</span><select data-k="capFont">' + FONTS.map(function (f) {
            return '<option' + (st.capFont === f ? ' selected' : '') + ' style="font-family:\'' + f + '\'">' + f + '</option>'; }).join('') + '</select></label>' +
          '<div class="ce-sec"><h4 style="margin-bottom:8px">Words at a time</h4>' + chips('capWords', [1, 2, 3, 4, 5]) + '</div>' +
          RS.rangeHtml('capSize', 'Size', st.capSize, 0.5, 2, 0.05, pct) + RS.rangeHtml('capPos', 'Height on screen', st.capPos, 0.1, 0.95, 0.01, pct) + '</div></div>' +
          '<div class="ce-sec"><div class="ce-colors">' + color('hl', 'Highlight') + color('capColor', 'Text') + '</div>' +
          RS.switchHtml('capUpper', 'ALL CAPS', st.capUpper) + RS.switchHtml('capEmoji', 'Auto emoji', st.capEmoji, 'Pops a matching emoji above some words 🔥') + '</div>' +
          (cues.length ? '<div class="ce-sec"><h4>Pop something on a word</h4><div class="ce-words">' + RS.wordsIn(words(), C.start, C.end).slice(0, 200).map(function (w) {
            return '<button type="button" class="ce-word" data-wordpop="' + w[0] + '" data-wtext="' + esc(w[2]) + '">' + esc(w[2]) + '</button>'; }).join('') + '</div>' +
            '<p class="ui-hint">Tap a word to drop an emoji, a title, a tool label or a prompt bar exactly when it\'s said. Or plan the whole clip in the <button type="button" class="ui-btn sm ghost" data-board>' + UI.icon('list') + 'Storyboard</button></p></div>' : '') +
          (cues.length ? '<div class="ce-sec"><h4>Edit the words</h4><div class="ce-cues" data-cues>' + cues.map(function (c, i) {
            return '<div class="ce-cue" data-cue="' + i + '" data-s="' + c.s + '" data-e="' + c.e + '"><button type="button" class="t" data-cue-seek>' + RS.fmt(c.s - C.start, true) + '</button>' +
              '<input type="text" value="' + esc(c.text) + '" data-cue-text maxlength="200"><button type="button" class="ui-btn sm ghost icon" data-cue-del aria-label="Delete line">' + UI.icon('x') + '</button></div>'; }).join('') + '</div>' +
            '<div class="ui-row" style="margin-top:10px"><button class="ui-btn sm" data-cue-add>' + UI.icon('plus') + 'Add a line at the playhead</button></div></div>' : '');
      },
      text: function () {
        var L = selLayer();
        return (L && (L.t === 'text' || L.t === 'card') ? layerEditor(L) : '') +
          '<div class="ce-sec"><h4>Add text</h4><div class="ce-tstyles">' + RS.TEXT_STYLES.map(function (x) {
            return '<button type="button" class="ce-ts" data-add-text="' + x.key + '"><canvas data-ts-cv="' + x.key + '"></canvas><span>' + esc(x.name) + '</span></button>'; }).join('') + '</div>' +
          '<p class="ui-hint">Pick a style to drop a text box at the playhead. 12 fonts, 9 styles.</p></div>' +
          '<div class="ce-sec"><h4>Cards & big titles</h4><div class="ce-cards">' + RS.CARDS.map(function (c) {
            return '<button type="button" class="ui-btn sm" data-add-card="' + c.key + '">' + { label: '🏷️', repo: '📦', prompt: '⌨️' }[c.key] + ' ' + esc(c.name) + '</button>'; }).join('') +
          '<button type="button" class="ui-btn sm" data-add-mag>📰 Magazine cover</button><button type="button" class="ui-btn sm" data-add-behind>🧍 Big title behind you</button></div>' +
          '<p class="ui-hint">Tool labels, a GitHub-style repo card and a prompt bar that types itself. Pin any of them to a word so they land the moment you say it.</p></div>' +
          layerList('text') +
          '<div class="ce-sec"><h4>Hook</h4>' + field('hook', 'Big text for the first seconds', 'Wait for it… 👀', 90) +
          '<div class="ce-two" style="margin-top:10px">' + RS.rangeHtml('hookSecs', 'Shows for', st.hookSecs, 1, 8, 0.5, function (v) { return v + 's'; }) +
          '<div class="ce-colors">' + color('hookBg', 'Sticker colour') + '</div></div></div>' +
          '<div class="ce-sec"><h4>Part label</h4>' + field('part', 'Like "Part 1" for a series', 'Part 1', 20) + '</div>' +
          '<div class="ce-sec"><h4>Your handle</h4>' + field('handle', 'Shown in a corner', '@yourname', 40) +
          '<div style="margin-top:10px">' + chips('handlePos', [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right'], ['off', 'Hide']]) + '</div></div>' +
          '<div class="ce-sec"><h4>End card</h4>' + RS.switchHtml('cta', 'Show a call to action at the end', st.cta) + field('ctaText', 'Text', 'Follow for part 2 👀', 60) + '</div>' +
          '<div class="ce-sec"><h4>Progress bar</h4>' + RS.switchHtml('progress', 'Show a progress bar', st.progress, 'Keeps people watching to the end.') +
          '<div class="ce-colors">' + color('progColor', 'Colour') + '</div></div>';
      },
      stickers: function () {
        var L = selLayer();
        return (L && L.t !== 'text' && L.t !== 'card' ? layerEditor(L) : '') +
          '<div class="ce-sec"><h4>Emoji stickers</h4>' + Object.keys(RS.EMOJI).map(function (cat) {
            return '<div class="ce-emo-cat"><span>' + esc(cat) + '</span><div class="ce-emojis">' + RS.EMOJI[cat].map(function (em) {
              return '<button type="button" class="ce-emo" data-add-emoji="' + em + '" aria-label="Add ' + em + '">' + em + '</button>'; }).join('') + '</div></div>'; }).join('') + '</div>' +
          '<div class="ce-sec"><h4>Word stickers</h4><div class="ce-badges">' + RS.BADGES.map(function (b, i) {
            return '<button type="button" class="ce-badge" data-add-badge="' + i + '" aria-label="Add ' + esc(b.v) + '"><canvas data-badge-cv="' + i + '"></canvas></button>'; }).join('') + '</div></div>' +
          '<div class="ce-sec"><h4>Doodles</h4><div class="ce-badges">' + RS.SHAPES.map(function (x) {
            return '<button type="button" class="ce-badge" data-add-shape="' + x[0] + '"><canvas data-shape-cv="' + x[0] + '"></canvas><small>' + esc(x[1]) + '</small></button>'; }).join('') + '</div>' +
          '<p class="ui-hint">Tip: point an arrow at the good bit, or circle it.</p></div>' +
          layerList('stickers');
      },
      fx: function () {
        var n = plan.joins.length, scenes = A && A.cuts ? A.cuts.filter(function (c) { return c > C.start && c < C.end; }).length : 0;
        return '<div class="ce-sec"><h4>Intro</h4>' + RS.switchHtml('wall', '🧱 Start with a 3×3 wall', st.wall, 'Your shot shrinks into the middle of a wall of 8 other moments from this video, then zooms back in. Replaces the intro transition.') +
          (st.wall ? '' : chips('transIn', RS.TRANS)) + '</div>' +
          '<div class="ce-sec"><h4>Between cuts</h4>' + chips('transCut', RS.TRANS) +
          '<p class="ui-hint">' + (n ? '✂️ Plays at ' + UI.plural(n, 'cut') + ' in this reel.' : 'No cuts in this reel yet. Turn on <b>Cut the silences</b> in Sound, or the switch below.') + '</p>' +
          RS.switchHtml('transScenes', 'Also on scene changes', st.transScenes, A && A.cuts ? 'When the video itself jumps to a new shot (' + UI.plural(scenes, 'change') + ' in this clip).' : 'Needs the video to be read first (open the project).') + '</div>' +
          '<div class="ce-sec"><h4>Outro</h4>' + chips('transOut', RS.TRANS) + '</div>' +
          '<div class="ce-sec">' + RS.rangeHtml('transLen', 'Transition length', st.transLen, 0.15, 1, 0.05, function (v) { return (+v).toFixed(2) + 's'; }) + '</div>' +
          '<div class="ce-sec"><div class="ui-row"><button type="button" class="ui-btn sm" data-tprev="in"' + (M ? '' : ' disabled') + '>' + UI.icon('play') + 'Preview intro</button>' +
          (n ? '<button type="button" class="ui-btn sm" data-tprev="cut">' + UI.icon('play') + 'Preview a cut</button>' : '') +
          '<button type="button" class="ui-btn sm" data-tprev="out"' + (M ? '' : ' disabled') + '>' + UI.icon('play') + 'Preview outro</button></div>' +
          '<p class="ui-hint">Transitions play while the reel plays and in the export. The paused preview shows a clean frame.</p></div>';
      },
      sound: function () {
        var cut = plan.srcLen < (C.end - C.start) - 0.05 ? (C.end - C.start - plan.srcLen).toFixed(1) : 0;
        return '<div class="ce-sec"><h4>Speed</h4>' + chips('speed', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']]) + '</div>' +
          '<div class="ce-sec">' + RS.switchHtml('cutSilence', 'Cut the silences', st.cutSilence, A && A.env ? 'Jump-cuts out the pauses.' : 'Needs Find reels to have listened to the video first.') +
          (st.cutSilence ? RS.rangeHtml('silence', 'How much to cut', st.silence, 0, 1, 0.05, function (v) { return v < 0.34 ? 'Gentle' : v < 0.67 ? 'Medium' : 'Snappy'; }) +
            '<p class="ui-hint">' + (cut ? '✂️ Removes ' + cut + 's of pauses. ' : 'No long pauses found. ') + 'Reel length: <b>' + plan.outDur.toFixed(1) + 's</b></p>' : '') + '</div>' +
          '<p class="ui-hint" style="margin:0">Fades and other transitions are in <b>FX</b>.</p>' +
          '<div class="ce-sec"><h4>Volume</h4>' + RS.rangeHtml('vol', 'Video sound', st.vol, 0, 2, 0.05, pct) + '</div>' +
          '<div class="ce-sec"><h4>Background music</h4><p class="ui-hint" style="margin-top:0">Pick a track from this device (only music you\'re allowed to use). It stays on this device too.</p>' +
          '<div class="ui-row"><label class="ui-btn sm">' + UI.icon('music') + (RS.musicFiles[C.id] ? 'Change track' : 'Choose a track') + '<input type="file" accept="audio/*" data-music hidden></label>' +
          (RS.musicFiles[C.id] ? '<span class="ui-badge lime">♪ ' + esc(RS.musicFiles[C.id].name.slice(0, 40)) + '</span><button class="ui-btn sm ghost" data-music-x>' + UI.icon('x') + 'Remove</button>'
            : st.musicName ? '<span class="small muted">Last time: ' + esc(st.musicName) + ' (choose it again)</span>' : '') + '</div>' +
          (RS.musicFiles[C.id] ? RS.rangeHtml('musicVol', 'Music volume', st.musicVol, 0, 1, 0.05, pct) + RS.switchHtml('duck', 'Duck under speech', st.duck, 'Music gets quieter when someone talks.') : '') + '</div>';
      },
      post: function () {
        var post = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed);
        return '<div class="ce-sec ce-post"><h4>Post caption</h4><textarea data-post="caption" maxlength="2200">' + esc(post.caption) + '</textarea>' +
          '<label class="ui-field" style="margin-top:10px"><span>Hashtags</span><input type="text" data-post="hashtags" value="' + esc(post.hashtags) + '" maxlength="300"></label>' +
          '<div class="ui-row" style="margin-top:10px"><button class="ui-btn sm" data-shuffle>' + UI.icon('refresh') + 'Another idea</button><button class="ui-btn sm" data-copy>' + UI.icon('copy') + 'Copy caption + tags</button></div></div>' +
          '<div class="ce-sec"><h4>Status</h4><div class="ui-seg">' + [['draft', 'Draft'], ['ready', 'Ready to post'], ['exported', 'Exported']].map(function (s) {
            return '<button type="button" data-status="' + s[0] + '" class="' + (C.status === s[0] ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') + '</div></div>' +
          '<div class="ui-card ce-export ce-sec"><h3>' + UI.icon('download') + ' Export this reel</h3>' +
          '<p class="muted small">' + plan.outDur.toFixed(1) + 's · ' + RS.dims(st.aspect, st.quality).join('×') + ' · ' + (/mp4/.test(RS.recorderType() || '') ? 'MP4' : 'WebM') + '. It plays through once while it records, right here on your device.</p>' +
          '<div class="ui-row">' + chips('quality', [['1080', 'Full HD'], ['720', 'Faster 720p']]) + '</div>' +
          RS.switchHtml('srt', 'Also download a captions file (.srt)', !!RS.wantSrt) +
          '<button class="ui-btn primary lg block" data-export style="margin-top:8px"' + (M && RS.canExport() ? '' : ' disabled') + '>' + UI.icon('download') + 'Export reel</button>' +
          (RS.canExport() ? '' : '<p class="ui-hint">This browser can\'t record video. Try Chrome, Edge or Safari on a computer.</p>') + '</div>';
      }
    };
    function drawPanel() {
      var panel = view.querySelector('[data-panel]'); if (!panel) return;
      panel.innerHTML = PANELS[tab]();
      if (tab === 'look') panel.querySelectorAll('[data-look-cv]').forEach(function (cv) {
        var l = RS.lookByKey(cv.getAttribute('data-look-cv'));
        RS.stylePreview(cv, RS.applyLook(Object.assign({}, st, { aspect: '9:16', hook: '' }), l.style, l.key), { width: 120, hook: '' });
      });
      if (tab === 'look') panel.querySelectorAll('[data-grade-cv]').forEach(function (cv) {
        RS.gradeThumb(cv, M && M.el.readyState >= 2 ? M.el : RS.demoSource(), cv.getAttribute('data-grade-cv'), st.grade === cv.getAttribute('data-grade-cv') ? st.gradeAmt : 0.8, st);
      });
      if (tab === 'captions') markCue();
      if (tab === 'text') panel.querySelectorAll('[data-ts-cv]').forEach(function (cv) {
        var x = RS.TEXT_STYLES.filter(function (y) { return y.key === cv.getAttribute('data-ts-cv'); })[0];
        RS.layerThumb(cv, RS.newLayer('text', 'Wow!', { ts: x.key, font: x.font, fill: x.fill, line: x.line, rot: 0 }), 240, 134);
      });
      if (tab === 'stickers') {
        panel.querySelectorAll('[data-badge-cv]').forEach(function (cv) { var b = RS.BADGES[+cv.getAttribute('data-badge-cv')]; RS.layerThumb(cv, RS.newLayer('badge', b.v, { shape: b.shape, fill: b.fill }), 240, 134); });
        panel.querySelectorAll('[data-shape-cv]').forEach(function (cv) { var k = cv.getAttribute('data-shape-cv'); RS.layerThumb(cv, RS.newLayer('shape', k, { fill: SHAPE_COLOR[k] }), 240, 134); });
      }
    }
    function showTab(name) {
      tab = lastTab = name;
      view.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === name); });
      drawPanel();
    }

    /* ---------- preview */
    function mountPlayer() {
      var cv = view.querySelector('[data-cv]'), d = RS.dims(st.aspect, '720'), k = 0.5625;
      cv.width = Math.round(d[0] * k); cv.height = Math.round(d[1] * k);
      var maxCss = Math.min(380, Math.min(view.querySelector('.ce-left').clientWidth, document.documentElement.clientWidth - 32) - 26);
      cv.style.width = Math.min(maxCss, cv.width * (st.aspect === '9:16' ? 1 : 0.9)) + 'px';
      if (player) player.destroy();
      player = RS.Player(cv, M, function () { return plan; }, function (o, D, playing) {
        var sc = view.querySelector('[data-scrub]'), t = view.querySelector('[data-t]'), pp = view.querySelector('[data-pp]');
        if (sc && !sc.matches(':active')) sc.value = Math.round(o / Math.max(0.01, D) * 1000);
        if (t) t.textContent = RS.fmt(o) + ' / ' + RS.fmt(D);
        if (pp) pp.innerHTML = UI.icon(playing ? 'pause' : 'play');
        if (tab === 'captions') markCue();
        drawTrim();
      });
      player.opt = { boxes: boxes, selected: selId };
      player.setMusic(RS.musicFiles[C.id] || null);
      RS.fontsReady().then(function () { return RS.seek(M.el, C.start); }).then(function () { player.draw(); drawTrim(); });
      wireDrag(cv);
      setTimeout(function () { var h = view.querySelector('[data-hint]'); if (h) h.style.opacity = 0; }, 3500);
    }
    function wireDrag(cv) {
      var start = null, pts = {};
      function region(e) {
        var r = cv.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
        if (st.layout === 'pip') { var pr = RS.pipRect(st, cv.width, cv.height), p = canvasPt(e); return p.x >= pr.x && p.x <= pr.x + pr.w && p.y >= pr.y && p.y <= pr.y + pr.h ? '2' : ''; }
        return st.layout === 'split' && y > st.split ? '2' : '';
      }
      function canvasPt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
      function inBox(b, p, pad) {
        var dx = p.x - b.x, dy = p.y - b.y, c = Math.cos(-b.rot), s = Math.sin(-b.rot);
        var lx = dx * c - dy * s, ly = dx * s + dy * c;
        return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
      }
      function handleAt(p) {  // the ↻ corner of the selected layer
        var b = boxes.filter(function (x) { return x.id === selId; })[0]; if (!b) return null;
        var u = Math.min(cv.width, cv.height) / 1080, pad = 14 * u, hx = b.w / 2 + pad, hy = b.h / 2 + pad;
        var c = Math.cos(b.rot), s = Math.sin(b.rot), x = b.x + hx * c - hy * s, y = b.y + hx * s + hy * c;
        return Math.hypot(p.x - x, p.y - y) < 40 * u ? b : null;
      }
      function hitLayer(p) {
        var u = Math.min(cv.width, cv.height) / 1080;
        for (var i = boxes.length - 1; i >= 0; i--) if (layerById(boxes[i].id) && inBox(boxes[i], p, 12 * u)) return boxes[i];
        return null;
      }
      cv.addEventListener('pointerdown', function (e) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        try { cv.setPointerCapture(e.pointerId); } catch (x) {} cv.classList.add('grab');
        if (Object.keys(pts).length > 1 && start && start.layer) { var L0 = layerById(start.layer); start.size = L0 ? L0.size : 1; start.dist = 0; return; }
        var p = canvasPt(e), hb = selId && handleAt(p), hit = hb ? null : hitLayer(p);
        if (hb) { var L1 = layerById(selId); start = { handle: true, layer: selId, cx: hb.x, cy: hb.y, d0: Math.max(1, Math.hypot(p.x - hb.x, p.y - hb.y)), a0: Math.atan2(p.y - hb.y, p.x - hb.x), size: L1.size, rot: L1.rot, moved: false }; return; }
        if (hit) {
          var L2 = layerById(hit.id), was = selId === hit.id;
          if (!was) select(hit.id);
          start = { layer: hit.id, x: e.clientX, y: e.clientY, lx: L2.x, ly: L2.y, size: L2.size, moved: false };
          return;
        }
        if (selId) { selId = null; player.opt.selected = null; player.draw(); drawPanel(); start = { deselect: true, moved: false }; return; }
        var reg = region(e);
        start = { x: e.clientX, y: e.clientY, fx: st['fx' + reg], fy: st['fy' + reg], reg: reg, moved: false, zoom: st['zoom' + reg] };
      });
      cv.addEventListener('pointermove', function (e) {
        if (!start || !pts[e.pointerId]) return;
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pts);
        if (start.deselect) return;
        if (start.handle) {
          var p = canvasPt(e), L = layerById(start.layer); if (!L) return;
          var d = Math.hypot(p.x - start.cx, p.y - start.cy), ang = Math.atan2(p.y - start.cy, p.x - start.cx);
          L.size = +RS.clamp(start.size * d / start.d0, 0.2, 5).toFixed(3);
          var r = start.rot + (ang - start.a0) * 180 / Math.PI; r = ((r + 540) % 360) - 180; if (Math.abs(r) < 4) r = 0;
          L.rot = Math.round(r); start.moved = true; layersChanged(false); return;
        }
        if (start.layer) {
          var LL = layerById(start.layer); if (!LL) return;
          if (ids.length === 2) {
            var pa = pts[ids[0]], pb = pts[ids[1]], dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
            if (!start.dist) start.dist = dist;
            LL.size = +RS.clamp(start.size * dist / start.dist, 0.2, 5).toFixed(3); start.moved = true; layersChanged(false); return;
          }
          var rr = cv.getBoundingClientRect(), mx = (e.clientX - start.x) / rr.width, my = (e.clientY - start.y) / rr.height;
          if (Math.abs(mx) + Math.abs(my) < 0.006 && !start.moved) return;
          LL.x = +RS.clamp(start.lx + mx, 0, 1).toFixed(4); LL.y = +RS.clamp(start.ly + my, 0, 1).toFixed(4); start.moved = true; layersChanged(false); return;
        }
        if (ids.length === 2) {  // pinch to zoom
          var a = pts[ids[0]], b = pts[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (!start.dist) start.dist = dist;
          set('zoom' + start.reg, RS.clamp(+(start.zoom * dist / start.dist).toFixed(3), 1, 3)); start.moved = true; return;
        }
        var r = cv.getBoundingClientRect(), dx = (e.clientX - start.x) / r.width, dy = (e.clientY - start.y) / r.height;
        if (Math.abs(dx) + Math.abs(dy) < 0.01 && !start.moved) return;
        start.moved = true;
        var sw = M.width || 16, sh = M.height || 9, W = 1, H = r.height / r.width;
        if (st.layout === 'split') H = start.reg ? H * (1 - st.split) : H * st.split;
        if (st.layout === 'fit' || st.layout === 'framed') { W = st.layout === 'framed' ? 0.88 : 1; H = W * sh / sw; }
        if (st.layout === 'pip' && start.reg) { var pr2 = RS.pipRect(st, cv.width, cv.height), pv = pipVid(); W = pr2.w / cv.width; H = pr2.h / cv.width; if (pv && pv.videoWidth) { sw = pv.videoWidth; sh = pv.videoHeight; } }
        var z = st['zoom' + start.reg], sc = Math.max(W / sw, H / sh) * z, ox = sw * sc - W, oy = sh * sc - H;
        var nfx = ox > 0.001 ? RS.clamp(start.fx - dx / ox, 0, 1) : st['fx' + start.reg], nfy = oy > 0.001 ? RS.clamp(start.fy - dy * (r.height / r.width) / oy, 0, 1) : st['fy' + start.reg];
        st['fx' + start.reg] = +nfx.toFixed(3); set('fy' + start.reg, +nfy.toFixed(3));
      });
      function up(e) {
        delete pts[e.pointerId]; cv.classList.remove('grab');
        if (start && (start.layer || start.handle || start.deselect)) {
          if (!Object.keys(pts).length) { if (start.moved) drawPanel(); start = null; }
          return;
        }
        if (start && !start.moved && !Object.keys(pts).length) player.toggle();
        if (start && start.moved && tab === 'look') syncPanelInputs();
        if (!Object.keys(pts).length) start = null;
      }
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        var sb = selId && boxes.filter(function (x) { return x.id === selId; })[0];
        if (sb && inBox(sb, canvasPt(e), 20)) { setLayer('size', +RS.clamp(selLayer().size * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.2, 5).toFixed(3)); syncLayerInputs(); return; }
        var reg = region(e);
        set('zoom' + reg, RS.clamp(+(st['zoom' + reg] * (e.deltaY < 0 ? 1.06 : 1 / 1.06)).toFixed(3), 1, 3));
        if (tab === 'look') syncPanelInputs();
      }, { passive: false });
    }
    function syncPanelInputs() {
      view.querySelectorAll('[data-panel] input[type=range][data-k]').forEach(function (inp) {
        var k = inp.getAttribute('data-k'); if (st[k] == null) return;
        inp.value = st[k];
        var show = view.querySelector('[data-show="' + k + '"]');
        if (show) show.textContent = /^zoom/.test(k) ? (+st[k]).toFixed(2).replace(/0$/, '') + '×' : Math.round(st[k] * 100) + '%';
      });
    }
    function syncLayerInputs() {
      var L = selLayer(); if (!L) return;
      ['size', 'rot'].forEach(function (k) {
        var inp = view.querySelector('[data-lk="' + k + '"]'), show = view.querySelector('[data-lshow="' + k + '"]');
        if (inp) inp.value = L[k]; if (show) show.textContent = LSHOW[k](L[k]);
      });
    }
    function markCue() {
      if (!M) return;
      var t = M.el.currentTime;
      view.querySelectorAll('[data-cue]').forEach(function (el) { el.classList.toggle('now', t >= +el.getAttribute('data-s') && t < +el.getAttribute('data-e')); });
    }

    /* ---------- trim bar */
    function trimWin() { var len = C.end - C.start, pad = Math.max(4, len * 0.35); return [Math.max(0, C.start - pad), Math.min(P.duration, C.end + pad)]; }
    function drawTrim() {
      var cv = view.querySelector('[data-trim]'); if (!cv) return;
      var dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      var g = cv.getContext('2d'), w = trimWin(), span = w[1] - w[0], X = function (t) { return (t - w[0]) / span * W; };
      var dark = document.documentElement.classList.contains('ui-dark');
      g.fillStyle = dark ? '#2C1F4A' : '#FFEEDB'; g.fillRect(0, 0, W, H);
      if (A && A.env) {
        g.fillStyle = dark ? '#6F5CB3' : '#B9A6FF';
        for (var x = 0; x < W; x += 2 * dpr) { var lv = RS.levelAt(A, w[0] + x / W * span); var bh = Math.max(dpr, lv * (H - 10 * dpr)); g.fillRect(x, (H - bh) / 2, 1.4 * dpr, bh); }
      }
      g.fillStyle = 'rgba(255,61,139,.22)'; g.fillRect(X(C.start), 0, X(C.end) - X(C.start), H);
      if (plan && plan.segs.length > 1) { g.fillStyle = 'rgba(26,16,51,.35)'; for (var i = 1; i < plan.segs.length; i++) g.fillRect(X(plan.segs[i - 1][1]), 0, X(plan.segs[i][0]) - X(plan.segs[i - 1][1]), H); }
      g.strokeStyle = '#1A1033'; g.lineWidth = 3 * dpr; g.strokeRect(X(C.start), 1.5 * dpr, X(C.end) - X(C.start), H - 3 * dpr);
      [C.start, C.end].forEach(function (t) { g.fillStyle = '#C6F432'; g.fillRect(X(t) - 6 * dpr, 0, 12 * dpr, H); g.strokeRect(X(t) - 6 * dpr, 1.5 * dpr, 12 * dpr, H - 3 * dpr); });
      if (M) { var px = X(M.el.currentTime); g.fillStyle = '#FF3D8B'; g.fillRect(px - 1.5 * dpr, 0, 3 * dpr, H); }
      var len = view.querySelector('[data-len]'); if (len) len.textContent = (C.end - C.start).toFixed(1) + 's' + (plan && plan.outDur < C.end - C.start - 0.05 ? ' → ' + plan.outDur.toFixed(1) + 's' : '');
      var sv = view.querySelector('[data-sv]'), ev = view.querySelector('[data-ev]');
      if (sv) sv.textContent = RS.fmt(C.start, true); if (ev) ev.textContent = RS.fmt(C.end, true);
    }
    function setRange(s, e, keepPlay) {
      s = RS.clamp(+s.toFixed(2), 0, P.duration - 1); e = RS.clamp(+e.toFixed(2), s + 1, P.duration);
      if (e - s > 600) e = s + 600;
      C.start = s; C.end = e; replan(); drawTrim();
      if (!keepPlay && player) { player.pause(); }
      saveSoon();
    }
    function wireTrim() {
      var cv = view.querySelector('[data-trim]'); if (!cv) return;
      var drag = null;
      cv.addEventListener('pointerdown', function (e) {
        var r = cv.getBoundingClientRect(), w = trimWin(), t = w[0] + (e.clientX - r.left) / r.width * (w[1] - w[0]);
        var tol = (w[1] - w[0]) * 0.04;
        drag = Math.abs(t - C.start) < tol ? 's' : Math.abs(t - C.end) < tol ? 'e' : null;
        if (drag) { drag = { k: drag, win: w }; cv.setPointerCapture(e.pointerId); }
        else if (player) RS.seek(M.el, RS.clamp(t, C.start, C.end - 0.05)).then(player.draw);
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var r = cv.getBoundingClientRect(), w = drag.win, t = w[0] + RS.clamp((e.clientX - r.left) / r.width, 0, 1) * (w[1] - w[0]);
        if (drag.k === 's') { C.start = RS.clamp(t, 0, C.end - 1); } else { C.end = RS.clamp(t, C.start + 1, P.duration); }
        replan(); drawTrim();
      });
      cv.addEventListener('pointerup', function () {
        if (!drag) return;
        var k = drag.k; drag = null; setRange(C.start, C.end);
        if (player) RS.seek(M.el, k === 's' ? C.start : Math.max(C.start, C.end - 2)).then(player.draw);
      });
    }

    /* ---------- captions editing */
    function cueEdit(el, text) {
      var s = +el.getAttribute('data-s'), e = +el.getAttribute('data-e');
      var keep = words().filter(function (w) { return w[0] < s - 0.001 || w[0] >= e - 0.001; });
      var fresh = RS.spread(text, s, Math.max(s + 0.3, e - 0.05));
      P.transcript = { source: (P.transcript && P.transcript.source) || 'manual', words: keep.concat(fresh).sort(function (a, b) { return a[0] - b[0]; }) };
      replan(); player && player.draw(); saveWordsSoon();
    }
    function cueAdd() {
      var t = M ? RS.clamp(M.el.currentTime, C.start, C.end - 0.5) : C.start;
      var after = words().filter(function (w) { return w[0] > t + 0.05; })[0], e = Math.min(C.end, after ? after[0] - 0.02 : t + 2.2, t + 2.2);
      if (e - t < 0.4) { UI.toast('There\'s already a line right here. Move the playhead to a quiet spot.', 'error'); return; }
      var fresh = RS.spread('New caption', t, e);
      P.transcript = { source: (P.transcript && P.transcript.source) || 'manual', words: words().concat(fresh).sort(function (a, b) { return a[0] - b[0]; }) };
      if (!st.captions) st.captions = true;
      replan(); drawPanel(); player && player.draw(); saveWordsSoon(); saveSoon();
      var inp = view.querySelectorAll('[data-cue-text]'); inp.forEach(function (x) { if (x.value === 'New caption') { x.focus(); x.select(); } });
    }
    function transcribeClip(btn) {
      var run = view.querySelector('[data-tx-run]'), bar = view.querySelector('[data-tx-bar]'), msg = view.querySelector('[data-tx-msg]');
      run.hidden = false; btn.disabled = true;
      var ranges = [[C.start, C.end]];
      RS.transcribe(M, ranges, 'en', function (f, t) { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = t; }).then(function (ws) {
        P.transcript = { source: 'whisper', words: RS.mergeWords(words(), ws, ranges) };
        return RS.db.updateProject(pid, { transcript: P.transcript }).then(function () { replan(); drawPanel(); player && player.draw(); UI.toast('Captions ready!', 'ok'); });
      }).catch(function (e) { run.hidden = true; btn.disabled = false; UI.toast(e.message, 'error'); });
    }

    /* ---------- storyboard: every line, what's on screen while it's said, ideas to add (RS.suggestBoard) */
    function boardModal() {
      if (player) player.pause();
      var rows = RS.cues(words(), C.start, C.end, 12), ideas = [];
      var tName = function (k) { return (RS.TRANS.filter(function (x) { return x[0] === k; })[0] || ['', k])[1]; };
      var gName = function (k) { return (RS.GRADES.filter(function (x) { return x[0] === k; })[0] || ['', k])[1]; };
      function onScreen(r, i) {
        var a = RS.srcToOut(plan, r.s), b = i < rows.length - 1 ? RS.srcToOut(plan, rows[i + 1].s) : plan.outDur, out = [];
        if (!i) {
          if (st.hook) out.push({ txt: '🪝 Hook: ' + st.hook, fx: true });
          out.push({ txt: st.wall ? '🧱 3×3 wall intro' : st.transIn !== 'none' ? tName(st.transIn) + ' intro' : '', fx: true });
          if (st.grade !== 'none') out.push({ txt: gName(st.grade) + ' colour' + (st.gradeWipe ? ' + before/after slider' : ''), fx: true });
          if (st.layout === 'pip') out.push({ txt: '🖼️ Corner card' + (st.pipName ? ': ' + st.pipName : ''), fx: true });
        }
        (st.layers || []).forEach(function (L) {
          var sp = RS.layerSpan(L, plan);
          if (L.all ? !i : sp[0] < b && sp[0] >= a - 0.001 || (!i && sp[0] < a)) out.push({ txt: layerLabel(L) + (L.behind ? ' · behind you' : '') + (L.all ? ' · whole reel' : ''), id: L.id });
        });
        if (st.transCut !== 'none') plan.joins.forEach(function (j) { if (j >= a && j < b) out.push({ txt: '✂️ ' + tName(st.transCut) + ' cut', fx: true }); });
        return out.filter(function (x) { return x.txt; });
      }
      var m = UI.modal('<h2>📋 Storyboard</h2><p class="muted">Every line you say and what\'s on screen while you say it. Agree on the plan here first, then fine-tune on the preview.</p>' +
        '<div class="sb-bar"><button type="button" class="ui-btn sm primary" data-sb-suggest>' + UI.icon('wand') + 'Suggest a plan</button>' +
        '<button type="button" class="ui-btn sm lime" data-sb-apply hidden></button>' +
        '<button type="button" class="ui-btn sm" data-sb-copy>' + UI.icon('copy') + 'Copy as text</button></div>' +
        '<div class="sb-wrap" data-sb-body></div><div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Done</button></div>', { wide: true });
      var el = m.el;
      function draw() {
        var body = el.querySelector('[data-sb-body]');
        if (!rows.length) { body.innerHTML = '<div class="ui-empty"><h3>No words yet</h3><p>Write the captions first (the Captions tab), then the storyboard fills itself in.</p></div>'; el.querySelector('[data-sb-suggest]').disabled = true; return; }
        body.innerHTML = '<table class="sb-table"><thead><tr><th>#</th><th>Time</th><th>You say</th><th>On screen</th></tr></thead><tbody>' + rows.map(function (r, i) {
          var chipsH = onScreen(r, i).map(function (x) {
            return '<span class="sb-chip' + (x.fx ? ' fx' : '') + '">' + esc(x.txt) + (x.id ? '<button type="button" class="sb-x" data-sb-del="' + esc(x.id) + '" aria-label="Remove" title="Remove">×</button>' : '') + '</span>'; }).join('');
          var ideaH = ideas.map(function (d, k) { return d.row === i ? '<button type="button" class="sb-chip idea' + (d.on ? '' : ' off') + '" data-idea="' + k + '" title="Tap to skip or keep">💡 ' + esc(d.label) + '</button>' : ''; }).join('');
          return '<tr><td class="n">' + (i + 1) + '</td><td class="t"><button type="button" data-sb-seek="' + r.s + '">' + RS.fmt(RS.srcToOut(plan, r.s), true) + '</button></td>' +
            '<td class="sb-says">' + esc(r.text) + '</td><td><div class="sb-on">' + chipsH + ideaH +
            '<select class="sb-add" data-sb-add="' + i + '" aria-label="Add to this line"><option value="">+ Add…</option><option value="title">✏️ Title</option><option value="behind">🧍 Line behind you</option>' +
            '<option value="emoji">😀 Emoji</option><option value="label">🏷️ Tool label</option><option value="prompt">⌨️ Prompt bar</option><option value="badge">💥 Word sticker</option></select></div></td></tr>'; }).join('') + '</tbody></table>';
        var on = ideas.filter(function (d) { return d.on; }).length, ap = el.querySelector('[data-sb-apply]');
        ap.hidden = !ideas.length; ap.textContent = on ? 'Add ' + UI.plural(on, 'idea') + ' to the reel' : 'Nothing picked';
        ap.disabled = !on;
      }
      function keyWord(r) { return r.words.map(function (w) { return String(w[2]).replace(/[^\p{L}\p{N}'’-]/gu, ''); }).sort(function (x, y) { return y.length - x.length; })[0] || 'this'; }
      function changed() { layersChanged(false); if (tab === 'text' || tab === 'stickers') drawPanel(); draw(); }
      el.addEventListener('click', function (e) {
        var b;
        if (e.target.closest('[data-sb-suggest]')) {
          ideas = RS.suggestBoard(rows, st, plan).map(function (d) { d.on = true; return d; });
          if (!ideas.length) UI.toast('No new ideas for this clip: it already looks planned!'); draw(); return;
        }
        if ((b = e.target.closest('[data-idea]'))) { var d = ideas[+b.getAttribute('data-idea')]; d.on = !d.on; draw(); return; }
        if (e.target.closest('[data-sb-apply]')) {
          var n = 0, anyBehind = false;
          ideas.filter(function (x) { return x.on; }).forEach(function (x) {
            if (x.kind === 'hook') { st.hook = x.hook; n++; return; }
            var made = layerFor(x.kind, x.word, x.at, x.line);
            if (placeLayer(made.L, { at: x.at, word: x.word, len: x.len || made.len })) { n++; if (made.L.behind) anyBehind = true; }
          });
          ideas = []; C.style = st; changed();
          if (anyBehind) needPerson(true);
          UI.toast('Added ' + UI.plural(n, 'thing') + ' to the reel ✓', 'ok'); return;
        }
        if ((b = e.target.closest('[data-sb-del]'))) { var id = b.getAttribute('data-sb-del'); st.layers = st.layers.filter(function (L) { return L.id !== id; }); if (selId === id) select(null); changed(); return; }
        if ((b = e.target.closest('[data-sb-seek]'))) { if (player) player.seekSrc(+b.getAttribute('data-sb-seek')); return; }
        if (e.target.closest('[data-sb-copy]')) {
          copy('Storyboard: ' + C.title + '\n\n' + rows.map(function (r, i) {
            return (i + 1) + '. ' + RS.fmt(RS.srcToOut(plan, r.s), true) + ' | ' + r.text + ' | ' + (onScreen(r, i).map(function (x) { return x.txt; }).join('; ') || '-'); }).join('\n'));
        }
      });
      el.addEventListener('change', function (e) {
        var sel = e.target.closest('[data-sb-add]'); if (!sel || !sel.value) return;
        var r = rows[+sel.getAttribute('data-sb-add')], k = sel.value, w = keyWord(r);
        var at = (r.words.filter(function (x) { return String(x[2]).indexOf(w) >= 0; })[0] || r.words[0])[0];
        if (k === 'prompt' || k === 'behind') at = r.s;
        var made = layerFor(k, w, at, k === 'prompt' || k === 'behind' ? r.text.replace(/[.,!?]+$/, '') : '');
        if (placeLayer(made.L, { at: at, word: k === 'prompt' || k === 'behind' ? r.words[0][2] : w, len: made.len })) { changed(); if (made.L.behind) needPerson(true); }
      });
      draw();
    }

    /* ---------- templates */
    function templatesModal() {
      var m = UI.modal('<h2>Templates</h2><p class="muted">Looks shared by other creators. Applying one keeps your framing, hook and timing.</p><div class="ce-tpl-grid" data-tg><div class="ui-skel"></div></div>', { wide: true });
      UI.apiQuiet('templates_list').then(function (r) {
        var grid = m.el.querySelector('[data-tg]');
        if (!r.templates.length) { grid.innerHTML = '<div class="ui-empty">No community templates yet. Be the first to share one!</div>'; return; }
        grid.innerHTML = r.templates.map(function (t) {
          return '<button type="button" class="ce-tpl" data-tpl="' + esc(t.id) + '"><canvas></canvas><b>' + esc(t.emoji + ' ' + t.name) + '</b><small>by ' + esc(t.by) + ' · ' + UI.plural(t.uses, 'use') + '</small></button>'; }).join('');
        grid.querySelectorAll('[data-tpl]').forEach(function (b, i) { RS.stylePreview(b.querySelector('canvas'), Object.assign({}, r.templates[i].style, { aspect: '9:16' }), { width: 150 }); });
        grid.addEventListener('click', function (e) {
          var b = e.target.closest('[data-tpl]'); if (!b) return;
          var t = r.templates.filter(function (x) { return x.id === b.getAttribute('data-tpl'); })[0];
          st = RS.applyLook(st, t.style, t.style.look || 'tpl-' + t.id.replace(/\W/g, '').slice(0, 16));
          C.style = st; replan(); drawPanel(); player && player.draw(); saveSoon();
          UI.apiQuiet('template_use', t.id).catch(function () {});
          m.close(); UI.toast(t.emoji + ' ' + t.name + ' applied', 'ok');
        });
      });
    }
    function shareModal() {
      var emojis = ['✨', '🔥', '💥', '🎙️', '🎮', '🍋', '🌙', '🎤', '📦', '🌈', '🍿', '💖'];
      var m = UI.modal('<h2>Share this look</h2><p class="muted">Your caption style, layout and colours go into the public gallery. Your video, hook and words don\'t.</p>' +
        '<form class="ui-stack" data-share><label class="ui-field"><span>Name</span><input type="text" name="name" maxlength="40" required minlength="2" placeholder="Sunny Podcast"></label>' +
        '<div class="rs-chips">' + emojis.map(function (em, i) { return '<label class="rs-chip' + (i ? '' : ' on') + '"><input type="radio" name="emoji" value="' + em + '"' + (i ? '' : ' checked') + ' hidden>' + em + '</label>'; }).join('') + '</div>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary">' + UI.icon('share') + 'Share</button></div></form>');
      var f = m.el.querySelector('[data-share]');
      f.addEventListener('change', function () { f.querySelectorAll('.rs-chip').forEach(function (c) { c.classList.toggle('on', c.querySelector('input').checked); }); });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = UI.formData(f);
        UI.busy(f.querySelector('.primary'), UI.api('template_publish', v.name, v.emoji, st)).then(function () { m.close(); UI.toast('Shared! Find it under Templates.', 'ok'); RS.confetti(60); });
      });
    }

    /* ---------- export */
    function doExport() {
      if (exporting || !M) return;
      if (player) player.pause();
      exporting = true;
      var signal = { aborted: false }, done = false;
      var m = UI.modal('<h2>Exporting “' + esc(C.title) + '”</h2><p class="muted" data-exp-msg>Recording on your device… keep this tab open.</p>' +
        '<canvas class="ce-exp-canvas" data-exp-cv></canvas><div class="rs-progress"><i data-exp-bar></i></div>' +
        '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Cancel</button></div>', { onclose: function () { if (!done) signal.aborted = true; exporting = false; } });
      var el = m.el, cv = el.querySelector('[data-exp-cv]');
      if ((st.layers || []).some(function (L) { return L.behind; }) && !RS.person.ready) el.querySelector('[data-exp-msg]').textContent = 'Loading the person cut-out, then recording on your device… keep this tab open.';
      RS.exportClip(M, plan, { quality: st.quality, music: RS.musicFiles[C.id] || null, signal: signal, onProgress: function (f, canvas) {
        el.querySelector('[data-exp-bar]').style.width = Math.round(f * 100) + '%';
        var r = 320 / canvas.height; cv.width = Math.round(canvas.width * r); cv.height = 320; cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height);
      } }).then(function (out) {
        done = true;
        var name = RS.slug(C.title) + '.' + out.ext;
        RS.lastExport = out;
        RS.download(out.blob, name);
        if (RS.wantSrt && words().length) RS.download(new Blob([RS.srt(plan, words())], { type: 'text/plain' }), RS.slug(C.title) + '.srt');
        var url = URL.createObjectURL(out.blob), post = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed);
        var file = new File([out.blob], name, { type: out.blob.type });
        var canShare = navigator.canShare && navigator.canShare({ files: [file] });
        var idx = P.clips.indexOf(C), next = P.clips[idx + 1];
        el.innerHTML = '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' +
          '<div class="ce-done"><h2>Your reel is ready! 🎉</h2><video src="' + url + '" controls playsinline loop></video>' +
          '<p class="muted small">' + esc(name) + ' · ' + RS.size(out.blob.size) + ' · ' + out.width + '×' + out.height + '. It\'s in your downloads.</p>' +
          '<div class="ui-row" style="justify-content:center"><button class="ui-btn" data-again>' + UI.icon('download') + 'Download again</button>' +
          (canShare ? '<button class="ui-btn lime" data-share-file>' + UI.icon('share') + 'Share</button>' : '') +
          '<button class="ui-btn" data-copy-post>' + UI.icon('copy') + 'Copy caption</button>' +
          (next ? '<a class="ui-btn primary" href="#clip/' + esc(pid) + '/' + esc(next.id) + '" data-go="clip/' + esc(pid) + '/' + esc(next.id) + '" data-close>Next clip ' + UI.icon('arrow') + '</a>' : '') + '</div></div>';
        el.querySelector('[data-again]').onclick = function () { RS.download(out.blob, name); };
        el.querySelector('[data-copy-post]').onclick = function () { copy(post.caption + '\n\n' + post.hashtags); };
        var sh = el.querySelector('[data-share-file]');
        if (sh) sh.onclick = function () { navigator.share({ files: [file], title: C.title, text: post.caption + '\n\n' + post.hashtags }).catch(function () {}); };
        RS.confetti();
        return RS.db.logExport(C.id, { seconds: out.seconds, format: out.ext }).then(function (r) {
          C.status = 'exported'; C.export_count = r.clip.export_count; RS.badgeToast(r.new_badges);
          if (tab === 'post') drawPanel();
        });
      }).catch(function (e) {
        exporting = false;
        if (e.cancelled) { UI.toast('Export cancelled'); return; }
        m.close(); UI.toast(e.message || 'Export failed.', 'error');
      }).then(function () { exporting = false; });
    }
    function copy(text) {
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { UI.toast('Copied!', 'ok'); }, function () {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); UI.toast('Copied!', 'ok'); } catch (e) { UI.toast('Couldn\'t copy. Select the text and copy it yourself.', 'error'); }
        ta.remove();
      });
    }

    /* ---------- events */
    view.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-tab]'))) {
        var nt = b.getAttribute('data-tab');
        if (selId && nt !== 'text' && nt !== 'stickers') { selId = null; if (player) { player.opt.selected = null; player.draw(); } }
        showTab(nt); return;
      }
      if ((b = t.closest('[data-add-text]'))) {
        var ts = RS.TEXT_STYLES.filter(function (x) { return x.key === b.getAttribute('data-add-text'); })[0];
        addLayer(RS.newLayer('text', 'Your text here', { ts: ts.key, font: ts.font, fill: ts.fill, line: ts.line }));
        var ta = view.querySelector('[data-led] textarea'); if (ta) { ta.focus(); ta.select(); }
        return;
      }
      if ((b = t.closest('[data-add-card]'))) {
        var ck = RS.CARDS.filter(function (x) { return x.key === b.getAttribute('data-add-card'); })[0];
        addLayer(RS.newLayer('card', ck.v, { card: ck.key, sub: ck.sub, icon: ck.icon, fill: ck.fill, anim: ck.key === 'prompt' ? 'type' : 'pop', upper: false }), null);
        if (ck.key === 'prompt') { var cl = selLayer(); if (cl) cl.e = +(cl.s + Math.min(4, plan.outDur - cl.s)).toFixed(2); }
        return;
      }
      if (t.closest('[data-add-mag]')) {
        var mw = (String(P.title || C.title).split(/\s+/).filter(function (x) { return x.length > 2; })[0] || 'Reels').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12) || 'REELS';
        addLayer(RS.newLayer('text', mw, { ts: 'magazine', font: 'Playfair Display', fill: '#FFFFFF', line: '#FFFFFF', y: 0.15, size: 1.7, rot: 0, behind: true, all: true, anim: 'fade' }));
        return;
      }
      if (t.closest('[data-add-behind]')) {
        var bt = (st.hook || C.title || 'Watch this').replace(/[.!?…]+$/, '').slice(0, 40);
        addLayer(RS.newLayer('text', bt, { ts: 'plain', font: 'Anton', y: 0.2, size: 1.6, rot: 0, behind: true, anim: 'zoom' }));
        return;
      }
      if ((b = t.closest('[data-lword]'))) {
        var Lw = selLayer(); if (!Lw) return;
        pinLayer(Lw, +b.getAttribute('data-lword'), b.getAttribute('data-wtext')); layersChanged(true);
        if (player) player.seekOut(Math.max(0, Lw.s - 0.4)).then(function () { player.play(); });
        return;
      }
      if (t.closest('[data-lunpin]')) { var Lu = selLayer(); if (Lu) { delete Lu.at; delete Lu.word; layersChanged(true); } return; }
      if ((b = t.closest('[data-wordpop]'))) { wordPopModal(+b.getAttribute('data-wordpop'), b.getAttribute('data-wtext')); return; }
      if (t.closest('[data-board]')) { boardModal(); return; }
      if ((b = t.closest('[data-grade]'))) { set('grade', b.getAttribute('data-grade'), true); return; }
      if (t.closest('[data-pip-x]')) { setPipFile(null); return; }
      if ((b = t.closest('[data-add-emoji]'))) { addLayer(RS.newLayer('emoji', b.getAttribute('data-add-emoji'))); return; }
      if ((b = t.closest('[data-add-badge]'))) { var bd = RS.BADGES[+b.getAttribute('data-add-badge')]; addLayer(RS.newLayer('badge', bd.v, { shape: bd.shape, fill: bd.fill, rot: -6 })); return; }
      if ((b = t.closest('[data-add-shape]'))) { var sk = b.getAttribute('data-add-shape'); addLayer(RS.newLayer('shape', sk, { fill: SHAPE_COLOR[sk], loop: 'none' })); return; }
      if ((b = t.closest('[data-sel]'))) { var id = b.getAttribute('data-sel'); select(selId === id ? null : id); return; }
      if (t.closest('[data-ldone]')) { select(null); return; }
      if (t.closest('[data-ldel]')) { deleteLayer(); return; }
      if (t.closest('[data-ldup]')) { var src = selLayer(); if (src) { var cp = Object.assign({}, src, { id: Math.random().toString(36).slice(2, 10), x: RS.clamp(src.x + 0.05, 0, 1), y: RS.clamp(src.y + 0.05, 0, 1) }); st.layers = st.layers.concat([cp]); layersChanged(false); select(cp.id); } return; }
      if (t.closest('[data-lhere]')) { var Lh = selLayer(); if (Lh) { setLayer('s', +RS.clamp(nowOut(), 0, Math.max(0, plan.outDur - 0.3)).toFixed(2), true); } return; }
      if ((b = t.closest('[data-lchip]'))) {
        var lk = b.getAttribute('data-lchip'), lv = b.getAttribute('data-v');
        if (lk === 'ts') { var sty = RS.TEXT_STYLES.filter(function (x) { return x.key === lv; })[0], cur = selLayer(); if (cur && sty) { cur.fill = sty.fill; cur.line = sty.line; } }
        setLayer(lk, lv, true);
        if ((lk === 'anim') && player && M) { var La = selLayer(); player.seekOut(La.all ? 0 : La.s).then(function () { player.play(); }); }
        return;
      }
      if ((b = t.closest('[data-tprev]'))) {
        if (!player) return;
        var w = b.getAttribute('data-tprev'), at = w === 'in' ? 0 : w === 'out' ? Math.max(0, plan.outDur - 1.6) : Math.max(0, plan.joins[0] - 0.9);
        player.seekOut(at).then(function () { player.play(); }); return;
      }
      if (t.closest('[data-pp]')) { player && player.toggle(); return; }
      if (t.closest('[data-export]')) { doExport(); return; }
      if ((b = t.closest('[data-nudge]'))) { var p = b.getAttribute('data-nudge').split(','), d = +p[1]; if (p[0] === 's') setRange(C.start + d, C.end); else setRange(C.start, C.end + d);
        if (player) RS.seek(M.el, p[0] === 's' ? C.start : Math.max(C.start, C.end - 1.5)).then(player.draw); return; }
      if ((b = t.closest('[data-look]'))) { var l = RS.lookByKey(b.getAttribute('data-look')); st = RS.applyLook(st, l.style, l.key); C.style = st; replan(); drawPanel(); player && player.draw(); saveSoon(); return; }
      if ((b = t.closest('[data-layout]'))) { set('layout', b.getAttribute('data-v'), true); return; }
      if ((b = t.closest('[data-chip]'))) {
        var k = b.getAttribute('data-chip'), v = b.getAttribute('data-v');
        if (['capWords', 'speed'].indexOf(k) >= 0) v = +v;
        set(k, v, true);
        if (k === 'aspect' && M) mountPlayer();
        if (k === 'speed' && player && player.playing()) M.el.playbackRate = v;
        return;
      }
      if (t.closest('[data-templates]')) { templatesModal(); return; }
      if (t.closest('[data-share-tpl]')) { shareModal(); return; }
      if (t.closest('[data-cue-add]')) { cueAdd(); return; }
      if ((b = t.closest('[data-tx]'))) { transcribeClip(b); return; }
      if ((b = t.closest('[data-cue-seek]'))) { var row = b.closest('[data-cue]'); if (player) RS.seek(M.el, +row.getAttribute('data-s')).then(player.draw); return; }
      if ((b = t.closest('[data-cue-del]'))) { cueEdit(b.closest('[data-cue]'), ''); drawPanel(); return; }
      if (t.closest('[data-music-x]')) { delete RS.musicFiles[C.id]; player && player.setMusic(null); set('musicName', '', true); return; }
      if (t.closest('[data-shuffle]')) { postSeed++; C.post = RS.postCopy(C, words(), RS.kit, postSeed); drawPanel(); saveSoon(); return; }
      if (t.closest('[data-copy]')) { var pc = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed); copy(pc.caption + '\n\n' + pc.hashtags); return; }
      if ((b = t.closest('[data-status]'))) {
        var sv = b.getAttribute('data-status');
        RS.db.saveClip(C.id, { status: sv }).then(function (nc) { C.status = nc.status; drawPanel(); UI.toast(sv === 'ready' ? 'Marked ready ✓' : 'Saved', 'ok'); });
      }
    });
    view.addEventListener('input', function (e) {
      var t = e.target, k = t.getAttribute('data-k');
      if (t.matches('[data-scrub]') && player) { player.seekOut(+t.value / 1000 * plan.outDur); return; }
      var lkey = t.getAttribute('data-lk');
      if (lkey && t.type !== 'checkbox') {
        if (t.type === 'range') { setLayer(lkey, +t.value); var ls = view.querySelector('[data-lshow="' + lkey + '"]'); if (ls) ls.textContent = LSHOW[lkey](+t.value);
          if ((lkey === 's' || lkey === 'len') && player) { var Ls = selLayer(); player.seekOut(lkey === 's' ? Ls.s + 0.5 : Math.max(Ls.s, Ls.e - 0.3)); } }
        else if (t.type === 'color') setLayer(lkey, t.value.toUpperCase());
        else setLayer(lkey, t.value);
        if (lkey === 'v') { var row = view.querySelector('[data-sel="' + selId + '"] span'); var Lv = selLayer(); if (row && Lv) row.textContent = (Lv.t === 'text' ? '✏️ ' : '🏷️ ') + Lv.v.replace(/\n/g, ' '); }
        return;
      }
      if (t.matches('[data-cue-text]')) { cueEdit(t.closest('[data-cue]'), t.value); return; }
      if (t.matches('[data-post]')) {
        var cur = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed);
        C.post = { caption: cur.caption, hashtags: cur.hashtags }; C.post[t.getAttribute('data-post')] = t.value; saveSoon(); return;
      }
      if (!k) return;
      if (t.type === 'range') {
        set(k, +t.value);
        var show = view.querySelector('[data-show="' + k + '"]');
        if (show) show.textContent = { zoom: 1, zoom2: 1 }[k] ? (+t.value).toFixed(2).replace(/0$/, '') + '×' : k === 'hookSecs' ? t.value + 's' : k === 'transLen' ? (+t.value).toFixed(2) + 's' : k === 'silence' ? (t.value < 0.34 ? 'Gentle' : t.value < 0.67 ? 'Medium' : 'Snappy') : Math.round(t.value * 100) + '%';
        if (k === 'silence') { var hint = t.closest('.ce-sec').querySelector('.ui-hint'); if (hint) hint.innerHTML = 'Reel length: <b>' + plan.outDur.toFixed(1) + 's</b>'; drawTrim(); }
        if (k === 'vol' && player) M.el.volume = RS.clamp(+t.value, 0, 1);
      } else if (t.type === 'text' || t.tagName === 'SELECT') set(k, t.value);
      else if (t.type === 'color') set(k, t.value.toUpperCase());
    });
    view.addEventListener('change', function (e) {
      var t = e.target, k = t.getAttribute('data-k');
      if (t.matches('[data-pipfile]')) { var pf = t.files[0]; if (pf) setPipFile(pf); return; }
      if (t.matches('[data-music]')) { var f = t.files[0]; if (f) { RS.musicFiles[C.id] = f; player && player.setMusic(f); set('musicName', f.name.slice(0, 80), true); } return; }
      if (t.matches('[data-subs]')) {
        var sf = t.files[0]; if (!sf) return;
        sf.text().then(function (txt) {
          var ws = RS.parseSubs(txt);
          if (!ws.length) { UI.toast('No captions found in that file.', 'error'); return; }
          P.transcript = { source: 'srt', words: ws };
          return RS.db.updateProject(pid, { transcript: P.transcript }).then(function () { replan(); drawPanel(); player && player.draw(); UI.toast('Imported captions for the whole video', 'ok'); });
        });
        return;
      }
      if (k === 'srt') { RS.wantSrt = t.checked; return; }
      if (t.type === 'checkbox' && t.getAttribute('data-lk')) { setLayer(t.getAttribute('data-lk'), t.checked, true); if (t.getAttribute('data-lk') === 'behind' && t.checked) needPerson(true); return; }
      if (t.type === 'checkbox' && k) {
        set(k, t.checked, ['captions', 'cutSilence', 'cta', 'transScenes', 'wall'].indexOf(k) >= 0);
        if (k === 'wall' && t.checked) loadWall();
        if ((k === 'gradeWipe' || k === 'wall') && t.checked && player) setTimeout(function () { player.seekOut(0).then(function () { player.play(); }); }, k === 'wall' ? 900 : 0);
      }
    });
    view.addEventListener('keydown', function (e) { if (e.target.matches('[data-title]') && e.key === 'Enter') e.target.blur(); });
    view.addEventListener('focusout', function (e) {
      if (!e.target.matches('[data-title]')) return;
      var v = e.target.value.trim(); if (!v) { e.target.value = C.title; return; }
      if (v !== C.title) { C.title = v; saveSoon(); }
    });
    function onKey(e) {
      if (!player || e.target.closest('input,textarea,select') || document.querySelector('.ui-modal-wrap')) return;
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      if (selId && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteLayer(); }
      if (selId && e.key === 'Escape') select(null);
    }
    document.addEventListener('keydown', onKey);
    var onResize = RS.debounce(function () { drawTrim(); }, 120);
    window.addEventListener('resize', onResize);

    var ready = RS.db.project(pid).then(function (p) {
      P = p; C = P.clips.filter(function (c) { return c.id === cid; })[0];
      if (!C) throw Object.assign(new Error('That clip isn\'t here any more.'), { uiApi: true });
      st = RS.fullStyle(C.style); C.style = st;
      if (!RS.kit || !Object.keys(RS.kit).length) RS.db.brand().then(function (b) { RS.kit = b.kit || {}; }).catch(function () {});
      return RS.media.restore(P).catch(function () { return null; });
    }).then(function (m) {
      M = m;
      return M ? RS.loadAnalysis(pid) : null;
    }).then(function (a) {
      A = a; replan(); draw(); wireTrim();
      needPerson(false); loadWall();
      document.title = C.title + ' · ' + UI.config.name;
      RS._clipPage = { plan: function () { return plan; }, media: function () { return M; }, style: function () { return st; }, clip: function () { return C; },
        selected: function () { return selId; }, boxes: function () { return boxes; } };
    });
    return { ready: ready, destroy: function () { dead = true; saveSoon.flush(); saveWordsSoon.flush(); if (player) player.destroy(); var pv = C && pipVid(); if (pv) pv.pause(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); } };
  });
})();
