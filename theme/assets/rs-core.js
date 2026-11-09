/* rs-core.js: moved unchanged from the JavaScript version (web/pages/_a_core.html). window.RS: helpers, icons, DEFAULT_STYLE + LOOKS, RS.db (server or this browser), RS.vault (OPFS), RS.media, RS.sample, confetti. Its CSS is in app.css. */
(function () {
  'use strict';
  var RS = window.RS = window.RS || {};

  /* ------------------------------------------------------------------ icons used across the app */
  Object.assign(UI.ICONS, {
    film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
    upload: '<path d="M12 16V4M6.5 9.5 12 4l5.5 5.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 4v12M6.5 10.5 12 16l5.5-5.5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
    wand: '<path d="m4 20 11-11"/><path d="m13 7 4 4"/><path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M9 3v2M8 4h2"/>',
    cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
    zap: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.3-1-1.6-1-2.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8M10 17h4"/>',
    flame: '<path d="M12 21c4 0 7-2.7 7-6.8 0-3.5-2.5-5.6-3.6-8.2-.6 2-1.6 3-2.8 3.3C13 6 11.6 4 9.5 3c.4 3.4-4.5 6-4.5 11.2C5 18.3 8 21 12 21z"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    hd: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7.5 9v6M11 9v6M7.5 12H11M14 9v6h1.5a3 3 0 0 0 0-6z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.3 14.2a4.6 4.6 0 0 0 7.4 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="3"/>'
  });

  /* ------------------------------------------------------------------ small helpers */
  RS.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  RS.fmt = function (s, tenths) {
    s = Math.max(0, s || 0);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    var ss = tenths ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + ss;
  };
  RS.parseTime = function (str) {
    var p = String(str || '').trim().split(':').map(Number);
    if (!p.length || p.some(function (x) { return isNaN(x); })) return null;
    return p.reduce(function (acc, x) { return acc * 60 + x; }, 0);
  };
  RS.uid = function (pre) { return (pre || 'l') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  RS.debounce = function (fn, ms) {
    var t, pending = false;
    var d = function () { var a = arguments, self = this; pending = true; clearTimeout(t); t = setTimeout(function () { pending = false; fn.apply(self, a); }, ms); };
    d.flush = function () { if (pending) { clearTimeout(t); pending = false; fn(); } };
    d.cancel = function () { clearTimeout(t); pending = false; };
    return d;
  };
  RS.size = function (b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.round((b || 0) / 1e3) + ' KB'; };
  RS.isGuest = function () { return !UI.me; };
  RS.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  RS.switchHtml = function (name, label, on, hint) {
    return '<label class="rs-switch"><span>' + UI.esc(label) + (hint ? '<small>' + UI.esc(hint) + '</small>' : '') + '</span>' +
      '<input type="checkbox" data-k="' + name + '"' + (on ? ' checked' : '') + '></label>';
  };
  RS.rangeHtml = function (name, label, v, min, max, step, show) {
    return '<label class="rs-range"><span>' + UI.esc(label) + '<b data-show="' + name + '">' + UI.esc(show ? show(v) : v) + '</b></span>' +
      '<input type="range" data-k="' + name + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"></label>';
  };
  RS.download = function (blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  RS.slug = function (s) { return String(s || 'reel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'reel'; };

  /* ------------------------------------------------------------------ styles: defaults + built-in looks
     Keep in step with SPEC in server_code/Styles.py. */
  RS.DEFAULT_STYLE = {
    look: 'creator', aspect: '9:16', layout: 'fill', zoom: 1, fx: 0.5, fy: 0.5, zoom2: 1, fx2: 0.5, fy2: 0.5, split: 0.5, bg: '#FF3D8B', punch: false,
    captions: true, capStyle: 'clean', capFont: 'Bricolage Grotesque', capSize: 1, capPos: 0.72, capWords: 3, capUpper: false, capEmoji: false, hl: '#C6F432', capColor: '#FFFFFF',
    hook: '', hookSecs: 3, hookBg: '#C6F432', part: '', handle: '', handlePos: 'tr', progress: true, progColor: '#FF3D8B', cta: false, ctaText: 'Follow for part 2 👀',
    speed: 1, cutSilence: false, silence: 0.5, vol: 1, musicName: '', musicVol: 0.25, duck: true, quality: '1080',
    transIn: 'fade', transOut: 'fade', transCut: 'none', transLen: 0.4, transScenes: false, layers: [],
    grade: 'none', gradeAmt: 0.75, gradeWipe: false, pipPos: 'tl', pipSize: 0.38, pipName: '', wall: false
  };
  RS.FONTS = ['Anton', 'Bangers', 'Luckiest Guy', 'Bungee', 'Titan One', 'Lilita One', 'Rubik Mono One', 'Permanent Marker', 'Pacifico', 'Bricolage Grotesque', 'DM Sans', 'Playfair Display'];
  /* Colour grades (style.grade), drawn with blend modes in RS.grade (_c_engine.html). Keep in step with GRADES in Styles.py. */
  RS.GRADES = [['none', '🚫 None'], ['warm', '🌅 Warm'], ['moody', '🌑 Moody'], ['cool', '🧊 Cool'], ['teal', '🎬 Teal & orange'], ['vivid', '🌈 Vivid'], ['film', '🎞️ Film'], ['bw', '⚫ Black & white']];
  /* Cards on the reel (layer t: 'card'): a tool label, a GitHub-style repo card, a prompt bar that types itself. */
  RS.CARDS = [{ key: 'label', name: 'Tool label', v: 'FFmpeg', sub: '', icon: '🎬', fill: '#22C55E' },
    { key: 'repo', name: 'Repo card', v: 'yt-dlp/yt-dlp', sub: 'A feature-rich command-line audio/video downloader', icon: '📦', fill: '#2F81F7' },
    { key: 'prompt', name: 'Prompt bar', v: 'Make it moody and the colours go dark', sub: '', icon: '', fill: '#D97757' }];
  RS.TRANS = [['none', '🚫 None'], ['fade', '🌑 Fade'], ['flash', '⚡ Flash'], ['zoom', '🔍 Zoom'], ['whip', '💨 Whip'], ['glitch', '📺 Glitch'],
    ['shake', '🫨 Shake'], ['spin', '🌀 Spin'], ['pixel', '👾 Pixel']];
  /* Text and stickers on the reel (style.layers). Keep the lists in step with server_code/Styles.py. */
  RS.TEXT_STYLES = [
    { key: 'outline', name: 'Bold outline', font: 'Anton', fill: '#FFFFFF', line: '#000000' },
    { key: 'double', name: 'Double', font: 'Luckiest Guy', fill: '#FFFFFF', line: '#FF3D8B' },
    { key: 'pop3d', name: '3D pop', font: 'Titan One', fill: '#C6F432', line: '#7B5CFF' },
    { key: 'hollow', name: 'Hollow', font: 'Rubik Mono One', fill: '#FFFFFF', line: '#FFFFFF' },
    { key: 'glow', name: 'Glow', font: 'Lilita One', fill: '#FFFFFF', line: '#22E6D0' },
    { key: 'sticker', name: 'Sticker', font: 'Bungee', fill: '#1A1033', line: '#C6F432' },
    { key: 'marker', name: 'Marker', font: 'Permanent Marker', fill: '#1A1033', line: '#FFE14D' },
    { key: 'plain', name: 'Soft', font: 'Pacifico', fill: '#FFFFFF', line: '#000000' },
    { key: 'magazine', name: 'Magazine', font: 'Playfair Display', fill: '#FFFFFF', line: '#FFFFFF' }
  ];
  RS.ANIMS = [['none', 'None'], ['pop', '💥 Pop'], ['fade', '🌫️ Fade'], ['slide', '⬆️ Slide up'], ['drop', '⬇️ Drop'], ['zoom', '🔍 Zoom'], ['spin', '🌀 Spin'], ['type', '⌨️ Type']];
  RS.LOOPS = [['none', 'Still'], ['wiggle', '〰️ Wiggle'], ['float', '🎈 Float'], ['pulse', '💓 Pulse'], ['shake', '🫨 Shake'], ['spin', '🔄 Spin']];
  RS.EMOJI = {
    'Hype': ['🔥', '💥', '⚡', '🚀', '💯', '🏆', '👑', '🤯', '😱', '🎉'],
    'Feels': ['😂', '🥹', '😍', '🥲', '😭', '😎', '🤔', '🙄', '😤', '💀'],
    'Hands': ['👀', '👉', '👇', '👆', '👏', '🙌', '🤝', '🫶', '💪', '✌️'],
    'Things': ['🍿', '🎤', '🎮', '🎧', '📸', '💡', '💸', '❤️', '⭐', '✨']
  };
  RS.BADGES = [
    { v: 'OMG', shape: 'burst', fill: '#FFE14D' }, { v: 'WAIT…', shape: 'bubble', fill: '#FFFFFF' }, { v: 'NO WAY', shape: 'burst', fill: '#FF3D8B' },
    { v: 'FACTS', shape: 'pill', fill: '#C6F432' }, { v: 'LOL', shape: 'bubble', fill: '#22E6D0' }, { v: 'NEW!', shape: 'circle', fill: '#FF3D8B' },
    { v: 'PART 2', shape: 'pill', fill: '#7B5CFF' }, { v: 'LINK IN BIO', shape: 'pill', fill: '#FFFFFF' }, { v: 'SUBSCRIBE', shape: 'pill', fill: '#FF3B3B' },
    { v: 'STORY TIME', shape: 'bubble', fill: '#FFE14D' }, { v: 'TOP 3', shape: 'circle', fill: '#C6F432' }, { v: '● LIVE', shape: 'pill', fill: '#FF3B3B' }
  ];
  RS.SHAPES = [['arrow', '➜ Arrow'], ['ring', '⭕ Circle it'], ['underline', '〰️ Underline'], ['sparkles', '✨ Sparkles'], ['heart', '❤️ Heart'], ['star', '⭐ Star']];
  RS.newLayer = function (t, v, extra) {
    var card = t === 'card';
    return Object.assign({ id: Math.random().toString(36).slice(2, 10), t: t, v: v, x: 0.5, y: t === 'text' ? 0.3 : card ? 0.2 : 0.42, size: 1, rot: t === 'text' ? -3 : 0,
      s: 0, e: 3, all: false, anim: 'pop', loop: t === 'text' || card ? 'none' : 'wiggle', font: 'Anton', ts: 'outline', fill: '#FFFFFF', line: '#000000', shape: 'pill', upper: t === 'text',
      behind: false }, extra || {});
  };
  RS.LOOKS = [
    { key: 'creator', name: 'Creator Clean', emoji: '🤍', style: { layout: 'fill', capStyle: 'clean', capFont: 'Bricolage Grotesque', capWords: 3, capUpper: false, capEmoji: false, punch: false, progress: true, progColor: '#FFFFFF', grade: 'none', transIn: 'fade', transCut: 'whip' } },
    { key: 'moody', name: 'Moody Talk', emoji: '🌑', style: { layout: 'fill', capStyle: 'clean', capFont: 'DM Sans', capWords: 4, capUpper: false, capEmoji: false, punch: false, progress: false, grade: 'moody', gradeAmt: 0.8, transIn: 'fade', transCut: 'whip' } },
    { key: 'pop-star', name: 'Pop Star', emoji: '🌟', style: { layout: 'fill', capStyle: 'pop', capFont: 'Anton', hl: '#C6F432', capWords: 3, capUpper: true, progress: true, progColor: '#FF3D8B', punch: true, transCut: 'zoom' } },
    { key: 'comic', name: 'Comic Chaos', emoji: '💥', style: { layout: 'fill', capStyle: 'comic', capFont: 'Luckiest Guy', hl: '#FFE14D', capWords: 2, capUpper: true, punch: true, progColor: '#FFE14D', transIn: 'zoom', transCut: 'flash' } },
    { key: 'karaoke', name: 'Karaoke', emoji: '🎤', style: { layout: 'fill', capStyle: 'karaoke', capFont: 'Anton', hl: '#FF3D8B', capWords: 4, capUpper: true } },
    { key: 'podcast', name: 'Podcast Split', emoji: '🎙️', style: { layout: 'split', split: 0.5, capStyle: 'boxed', capFont: 'DM Sans', hl: '#FFD84D', capPos: 0.5, capWords: 4, capUpper: false } },
    { key: 'framed', name: 'Sticker Frame', emoji: '🖼️', style: { layout: 'framed', bg: '#FF3D8B', capStyle: 'boxed', capFont: 'Bricolage Grotesque', hl: '#C6F432', hookBg: '#C6F432', capPos: 0.8, capUpper: false } },
    { key: 'neon', name: 'Neon Night', emoji: '🌙', style: { layout: 'fit', capStyle: 'neon', capFont: 'Lilita One', hl: '#22E6D0', progColor: '#7C5CFF', capUpper: false, transIn: 'glitch', transCut: 'glitch' } },
    { key: 'clean', name: 'Clean & Calm', emoji: '🫧', style: { layout: 'fit', capStyle: 'minimal', capFont: 'DM Sans', capWords: 5, capUpper: false, progress: false, punch: false, capEmoji: false, transCut: 'fade' } }
  ];
  RS.KIT_KEYS = ['look', 'aspect', 'layout', 'bg', 'punch', 'captions', 'capStyle', 'capFont', 'capSize', 'capPos', 'capWords', 'capUpper', 'capEmoji', 'hl', 'capColor',
    'hookSecs', 'hookBg', 'handle', 'handlePos', 'progress', 'progColor', 'cta', 'ctaText', 'cutSilence', 'transIn', 'transOut', 'transCut', 'transLen', 'quality', 'grade', 'gradeAmt'];
  RS.LOOK_KEYS = ['layout', 'split', 'bg', 'punch', 'captions', 'capStyle', 'capFont', 'capSize', 'capPos', 'capWords', 'capUpper', 'capEmoji', 'hl', 'capColor',
    'hookBg', 'progress', 'progColor', 'cta', 'ctaText', 'fy2', 'transIn', 'transOut', 'transCut', 'grade', 'gradeAmt'];
  RS.kit = {};  // the signed-in person's (or guest's) brand kit, set by the studio and brand pages
  RS.styleFor = function (over) {
    var st = Object.assign({}, RS.DEFAULT_STYLE);
    RS.KIT_KEYS.forEach(function (k) { if (RS.kit[k] !== undefined && RS.kit[k] !== '') st[k] = RS.kit[k]; });
    if (RS.kit.look) { var lk = RS.lookByKey(RS.kit.look); if (lk && !RS.kit.capStyle) Object.assign(st, lk.style); }
    return Object.assign(st, over || {});
  };
  RS.fullStyle = function (st) {
    st = st || {};
    var out = Object.assign({}, RS.DEFAULT_STYLE, st);
    if (st.transIn === undefined && st.fadeIn === false) out.transIn = 'none';    // clips saved before transitions
    if (st.transOut === undefined && st.fadeOut === false) out.transOut = 'none';
    delete out.fadeIn; delete out.fadeOut;
    out.layers = (Array.isArray(st.layers) ? st.layers : []).map(function (L) { return Object.assign({}, L); });
    return out;
  };
  RS.lookByKey = function (k) { return RS.LOOKS.filter(function (l) { return l.key === k; })[0] || null; };
  RS.applyLook = function (st, lookStyle, key) {  // keeps the clip's own framing, hook and timing
    var out = Object.assign({}, st);
    RS.LOOK_KEYS.forEach(function (k) { if (lookStyle[k] !== undefined) out[k] = lookStyle[k]; });
    out.look = key || lookStyle.look || out.look;
    return out;
  };

  /* ------------------------------------------------------------------ data layer
     Same shapes as server_code/Studio.py + Brand.py. Signed in: the server. Guest: this browser (localStorage). */
  var LKEY = 'local.v1';
  function L() { return UI.store.get(LKEY, null) || { projects: [], exports: [], brand: {} }; }
  function Lsave(d) {
    try { localStorage.setItem(UI.config.key + '.' + LKEY, JSON.stringify(d)); }
    catch (e) { throw Object.assign(new Error('This browser\'s storage is full. Delete an old project, or sign up to keep projects in your account.'), { uiApi: true }); }
  }
  function nowIso() { return new Date().toISOString(); }
  function lproj(d, id) { return d.projects.filter(function (p) { return p.id === id; })[0]; }
  function lclip(d, id) {
    for (var i = 0; i < d.projects.length; i++) {
      var c = (d.projects[i].clips || []).filter(function (c) { return c.id === id; })[0];
      if (c) return { p: d.projects[i], c: c };
    }
    return null;
  }
  function summary(p) {
    var cl = p.clips || [];
    var s = Object.assign({}, p);
    delete s.clips; delete s.transcript;
    s.clip_count = cl.length;
    s.ready_count = cl.filter(function (c) { return c.status === 'ready'; }).length;
    s.exported_count = cl.filter(function (c) { return c.status === 'exported'; }).length;
    s.has_transcript = !!(p.transcript && p.transcript.words && p.transcript.words.length);
    return s;
  }
  function sortClips(p) { (p.clips || []).sort(function (a, b) { return (a.idx - b.idx) || (a.start - b.start); }); return p; }
  function full(p) { var s = summary(p); s.transcript = p.transcript || null; s.settings = p.settings || {}; s.clips = sortClips(p).clips.slice(); return JSON.parse(JSON.stringify(s)); }
  function fail(msg) { return Promise.reject(Object.assign(new Error(msg), { uiApi: true, expected: true })); }
  var BADGES = [['first_cut', '✂️', 'First cut', 'Export your first reel'], ['hat_trick', '🎩', 'Hat trick', 'Export 3 reels'],
    ['ten_club', '🔟', 'Ten-reel club', 'Export 10 reels'], ['caption_crew', '💬', 'Caption crew', 'Export 5 reels with captions'],
    ['on_fire', '🔥', 'On fire', 'Export on 3 days in a row'], ['binge', '🍿', 'Binge cutter', 'Export 5 reels from one video'],
    ['shape_shifter', '📐', 'Shape shifter', 'Export in 3 different shapes'], ['tastemaker', '🎨', 'Tastemaker', 'Share a template with everyone']];
  function localStats(d) {
    var ex = d.exports, days = {}, per = {};
    ex.forEach(function (e) { days[e.at.slice(0, 10)] = 1; per[e.project] = (per[e.project] || {}); per[e.project][e.clip] = 1; });
    var list = Object.keys(days).sort().reverse(), streak = 0;
    var today = new Date(); var iso = function (dd) { return dd.toISOString().slice(0, 10); };
    var y = new Date(today.getTime() - 864e5);
    if (list.length && (list[0] === iso(today) || list[0] === iso(y))) {
      streak = 1;
      for (var i = 1; i < list.length; i++) { if ((new Date(list[i - 1]) - new Date(list[i])) / 864e5 === 1) streak++; else break; }
    }
    return { exports: ex.length, seconds: Math.round(ex.reduce(function (a, e) { return a + (e.seconds || 0); }, 0)), streak: streak,
      minutes_saved: ex.length * 12, captions: ex.filter(function (e) { return e.captions; }).length,
      aspects: Object.keys(ex.reduce(function (a, e) { a[e.aspect] = 1; return a; }, {})).length,
      best_project: Math.max.apply(null, [0].concat(Object.keys(per).map(function (k) { return Object.keys(per[k]).length; }))),
      templates: 0, projects: d.projects.length, clips: d.projects.reduce(function (a, p) { return a + (p.clips || []).length; }, 0) };
  }
  RS.badgesFor = function (s) {
    var got = { first_cut: s.exports >= 1, hat_trick: s.exports >= 3, ten_club: s.exports >= 10, caption_crew: s.captions >= 5, on_fire: s.streak >= 3,
      binge: s.best_project >= 5, shape_shifter: s.aspects >= 3, tastemaker: s.templates >= 1 };
    return BADGES.map(function (b) { return { key: b[0], emoji: b[1], name: b[2], desc: b[3], got: !!got[b[0]] }; });
  };
  function cleanClip(raw, idx, dur) {
    var s = +raw.start, e = Math.min(+raw.end, dur || 1e9);
    if (!(e - s >= 1)) return null;
    return { id: RS.uid('c'), idx: raw.idx != null ? raw.idx : idx, title: raw.title || ('Clip ' + (idx + 1)), start: +s.toFixed(3), end: +e.toFixed(3),
      score: raw.score == null ? null : raw.score, label: raw.label || '', source: raw.source || 'manual', edited: false, status: raw.status || 'draft',
      style: raw.style || {}, post: raw.post || {}, export_count: 0, exported_at: null, created: nowIso(), updated: nowIso() };
  }

  RS.db = {
    home: function () {
      if (UI.me) return UI.api('studio_home');
      var d = L(), s = localStats(d);
      return Promise.resolve({ projects: d.projects.slice().sort(function (a, b) { return a.updated < b.updated ? 1 : -1; }).map(summary),
        stats: s, badges: RS.badgesFor(s), brand: d.brand || {} });
    },
    project: function (id) {
      if (UI.me && !/^l/.test(id)) return UI.api('project_get', id).then(function (r) { return r.project; });
      var p = lproj(L(), id);
      return p ? Promise.resolve(full(p)) : fail(UI.me ? 'That project was made before you signed in. Find it on the Studio page.' : 'That project isn\'t in this browser.');
    },
    createProject: function (meta, transcript) {
      if (UI.me) return UI.api('project_create', meta, transcript || null).then(function (r) { return r.project; });
      var d = L();
      if (d.projects.length >= 12) return fail('Guests can keep 12 projects in this browser. Delete one, or sign up for more.');
      var p = Object.assign({ id: RS.uid('l'), title: meta.title || meta.file_name || 'Untitled video', created: nowIso(), updated: nowIso(), settings: {}, clips: [] }, meta);
      p.transcript = transcript || null;
      d.projects.push(p); Lsave(d);
      return Promise.resolve(full(p));
    },
    updateProject: function (id, fields) {
      if (UI.me && !/^l/.test(id)) return UI.api('project_update', id, fields).then(function (r) { return r.project; });
      var d = L(), p = lproj(d, id);
      if (!p) return fail('That project isn\'t here any more.');
      Object.assign(p, fields, { updated: nowIso() }); Lsave(d);
      return Promise.resolve(summary(p));
    },
    deleteProject: function (id) {
      if (UI.me && !/^l/.test(id)) return UI.api('project_delete', id);
      var d = L(); d.projects = d.projects.filter(function (p) { return p.id !== id; }); Lsave(d);
      return Promise.resolve({ ok: true });
    },
    addClips: function (pid, clips, replaceDrafts) {
      if (UI.me && !/^l/.test(pid)) return UI.api('clips_add', pid, clips, !!replaceDrafts);
      var d = L(), p = lproj(d, pid);
      if (!p) return fail('That project isn\'t here any more.');
      if (replaceDrafts) p.clips = p.clips.filter(function (c) { return !(c.source === 'auto' && !c.edited && c.status === 'draft'); });
      if (p.clips.length + clips.length > 60) return fail('A project can hold 60 clips. Delete a few first.');
      var base = Math.max.apply(null, [-1].concat(p.clips.map(function (c) { return c.idx; }))) + 1, added = [];
      clips.forEach(function (raw, i) { var c = cleanClip(raw, base + i, p.duration); if (c) { p.clips.push(c); added.push(c.id); } });
      p.updated = nowIso(); Lsave(d);
      return Promise.resolve({ ok: true, clips: full(p).clips, added: added });
    },
    saveClip: function (cid, fields) {
      if (UI.me && !/^l/.test(cid)) return UI.api('clip_save', cid, fields).then(function (r) { return r.clip; });
      var d = L(), f = lclip(d, cid);
      if (!f) return fail('That clip isn\'t here any more.');
      if (fields.start != null && fields.end - fields.start < 1) return fail('A clip must be at least 1 second long.');
      if (['start', 'end', 'style', 'title'].some(function (k) { return k in fields; })) fields.edited = true;
      Object.assign(f.c, JSON.parse(JSON.stringify(fields)), { updated: nowIso() }); f.p.updated = nowIso(); Lsave(d);
      return Promise.resolve(JSON.parse(JSON.stringify(f.c)));
    },
    duplicateClip: function (cid) {
      if (UI.me && !/^l/.test(cid)) return UI.api('clip_duplicate', cid);
      var d = L(), f = lclip(d, cid);
      if (!f) return fail('That clip isn\'t here any more.');
      f.p.clips.forEach(function (c) { if (c.idx > f.c.idx) c.idx++; });
      var copy = Object.assign(JSON.parse(JSON.stringify(f.c)), { id: RS.uid('c'), idx: f.c.idx + 1, title: f.c.title + ' (copy)', source: 'copy', status: 'draft', export_count: 0, exported_at: null, edited: false });
      f.p.clips.push(copy); Lsave(d);
      return Promise.resolve({ ok: true, clip: copy, clips: full(f.p).clips });
    },
    deleteClip: function (cid) {
      if (UI.me && !/^l/.test(cid)) return UI.api('clip_delete', cid);
      var d = L(), f = lclip(d, cid);
      if (f) { f.p.clips = f.p.clips.filter(function (c) { return c.id !== cid; }); Lsave(d); }
      return Promise.resolve({ ok: true });
    },
    logExport: function (cid, info) {
      if (UI.me && !/^l/.test(cid)) return UI.apiQuiet('export_logged', cid, info);
      var d = L(), f = lclip(d, cid);
      if (!f) return fail('That clip isn\'t here any more.');
      var before = RS.badgesFor(localStats(d)).filter(function (b) { return b.got; }).map(function (b) { return b.key; });
      var st = RS.fullStyle(f.c.style);
      d.exports.push({ at: nowIso(), seconds: info.seconds || 0, aspect: st.aspect, captions: !!st.captions, project: f.p.id, clip: cid });
      f.c.status = 'exported'; f.c.export_count = (f.c.export_count || 0) + 1; f.c.exported_at = nowIso();
      Lsave(d);
      var s = localStats(d);
      return Promise.resolve({ ok: true, clip: f.c, stats: s, new_badges: RS.badgesFor(s).filter(function (b) { return b.got && before.indexOf(b.key) < 0; }) });
    },
    brand: function () {
      if (UI.me) return UI.api('brand_get');
      return Promise.resolve({ kit: L().brand || {}, templates: [] });
    },
    saveBrand: function (kit) {
      if (UI.me) return UI.api('brand_save', kit).then(function (r) { return r.kit; });
      var d = L(); d.brand = kit; Lsave(d);
      return Promise.resolve(kit);
    },
    localProjects: function () { return L().projects; },
    forgetLocal: function (ids) { var d = L(); d.projects = d.projects.filter(function (p) { return ids.indexOf(p.id) < 0; }); Lsave(d); }
  };

  /* ------------------------------------------------------------------ the vault: videos kept on this device (OPFS) */
  RS.vault = {
    ok: !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemWritableFileStream),
    dir: function () { return navigator.storage.getDirectory().then(function (root) { return root.getDirectoryHandle('reelstuber', { create: true }); }); },
    save: function (name, blob) {
      if (!RS.vault.ok) return Promise.resolve(false);
      return RS.vault.dir().then(function (d) { return d.getFileHandle(name, { create: true }); })
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
        .then(function () { return true; }).catch(function (e) { console.warn('vault save', e); return false; });
    },
    get: function (name) {
      if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve(null);
      return RS.vault.dir().then(function (d) { return d.getFileHandle(name); }).then(function (h) { return h.getFile(); }).catch(function () { return null; });
    },
    drop: function (name) {
      if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve();
      return RS.vault.dir().then(function (d) { return d.removeEntry(name); }).catch(function () {});
    },
    saveJSON: function (name, obj) { return RS.vault.save(name, new Blob([JSON.stringify(obj)], { type: 'application/json' })); },
    getJSON: function (name) { return RS.vault.get(name).then(function (f) { return f ? f.text().then(JSON.parse) : null; }).catch(function () { return null; }); },
    estimate: function () { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null); }
  };

  /* ------------------------------------------------------------------ media: loading videos */
  function once(el, ev, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { cleanup(); res('timeout'); }, ms || 8000);
      function ok() { cleanup(); res(ev); }
      function bad() { cleanup(); rej(new Error('This video can\'t be played in this browser. Try an MP4 (H.264) or WebM file.')); }
      function cleanup() { clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); }
      el.addEventListener(ev, ok); el.addEventListener('error', bad);
    });
  }
  RS.seek = function (v, t) {
    t = RS.clamp(t, 0, Math.max(0, (v.duration || 0) - 0.01));
    if (Math.abs(v.currentTime - t) < 0.002 && v.readyState >= 2) return Promise.resolve();
    var p = once(v, 'seeked', 5000);
    v.currentTime = t;
    return p;
  };
  function fixDuration(v) {
    if (isFinite(v.duration) && v.duration > 0) return Promise.resolve();
    // Videos recorded in a browser often don't say how long they are until we jump to the end.
    return new Promise(function (res) {
      var done = false;
      function fin() { if (done) return; done = true; v.removeEventListener('durationchange', on); v.currentTime = 0; once(v, 'seeked', 4000).then(res, res); }
      function on() { if (isFinite(v.duration) && v.duration > 0) fin(); }
      v.addEventListener('durationchange', on);
      v.currentTime = 1e7;
      setTimeout(fin, 8000);
    });
  }
  RS.videoEl = function (url) {
    var v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous';
    v.src = url;
    return once(v, 'loadedmetadata', 20000).then(function (r) {
      if (r === 'timeout') throw new Error('This video took too long to open. Try an MP4 (H.264) or WebM file.');
      return fixDuration(v);
    }).then(function () { return v; });
  };
  RS.frameThumb = function (v, w) {
    w = w || 192;
    var h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    try { c.getContext('2d').drawImage(v, 0, 0, w, h); return c.toDataURL('image/jpeg', 0.72); } catch (e) { return ''; }
  };
  RS.media = {
    cache: {},
    get: function (pid) { return RS.media.cache[pid] || null; },
    /* Open a video (File or Blob) for a project: a shared <video> for previews + the facts we need. */
    open: function (pid, blob, name) {
      var old = RS.media.cache[pid];
      if (old && old.blob === blob) return Promise.resolve(old);
      var url = URL.createObjectURL(blob);
      return RS.videoEl(url).then(function (v) {
        if (old) RS.media.release(pid);
        var m = { pid: pid, blob: blob, url: url, el: v, duration: v.duration, width: v.videoWidth, height: v.videoHeight, name: name || blob.name || 'video', size: blob.size };
        RS.media.cache[pid] = m;
        return m;
      }, function (e) { URL.revokeObjectURL(url); throw e; });
    },
    /* Facts about a dropped file before it becomes a project: length, size, a preview frame. */
    probe: function (file) {
      var url = URL.createObjectURL(file);
      return RS.videoEl(url).then(function (v) {
        var d = v.duration;
        if (!(d > 0.5)) throw new Error('That video seems to be empty.');
        if (!v.videoWidth) throw new Error('That file has no picture we can read. Try an MP4 (H.264) or WebM video.');
        return RS.seek(v, Math.min(d * 0.15, 6)).then(function () {
          var out = { duration: +d.toFixed(3), width: v.videoWidth, height: v.videoHeight, thumb: RS.frameThumb(v, 192) };
          v.src = ''; URL.revokeObjectURL(url);
          return out;
        });
      }, function (e) { URL.revokeObjectURL(url); throw e; });
    },
    release: function (pid) {
      var m = RS.media.cache[pid];
      if (!m) return;
      try { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); } catch (e) {}
      URL.revokeObjectURL(m.url);
      delete RS.media.cache[pid];
    },
    /* Find a project's video again: in memory, the bundled sample, or the vault. Resolves to the media or null. */
    restore: function (p) {
      if (RS.media.cache[p.id]) return Promise.resolve(RS.media.cache[p.id]);
      if (p.sample) return RS.sample().then(function (s) { return RS.media.open(p.id, s.blob, 'sample.webm'); });
      return RS.vault.get('video-' + p.id).then(function (f) { return f ? RS.media.open(p.id, f, p.file_name) : null; }).catch(function () { return null; });
    },
    keep: function (pid, file) { return RS.vault.save('video-' + pid, file); },
    forget: function (pid) { RS.media.release(pid); RS.vault.drop('video-' + pid); RS.vault.drop('analysis-' + pid + '.json'); delete RS.analyses[pid]; }
  };
  RS.analyses = {};  // pid -> analysis (see _b_smart.html)

  /* The bundled sample episode (assets/sample.webm + sample.json): fetched once as a Blob so seeking always works. */
  var samplePromise = null;
  RS.sample = function () {
    if (!samplePromise) {
      samplePromise = Promise.all([
        fetch('_/theme/sample.webm').then(function (r) { if (!r.ok) throw new Error('The sample video didn\'t load.'); return r.blob(); }),
        fetch('_/theme/sample.json').then(function (r) { return r.json(); })
      ]).then(function (x) { return { blob: new File([x[0]], 'snack-lab-ep12.webm', { type: 'video/webm' }), transcript: x[1] }; });
      samplePromise.catch(function () { samplePromise = null; });
    }
    return samplePromise;
  };

  /* ------------------------------------------------------------------ confetti */
  RS.confetti = function (n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'); c.className = 'rs-confetti'; c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    var g = c.getContext('2d'), cols = ['#FF3D8B', '#C6F432', '#7B5CFF', '#FFD84D', '#22E6D0', '#1A1033'], ps = [];
    for (var i = 0; i < (n || 140); i++) ps.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4,
      r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, w: 7 + Math.random() * 8, h: 5 + Math.random() * 6, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function tick(t) {
      g.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(tick); else c.remove();
    })(t0);
  };
  RS.badgeToast = function (badges) {
    (badges || []).forEach(function (b, i) { setTimeout(function () { UI.toast(b.emoji + ' New badge: ' + b.name + '!', 'ok'); }, 600 + i * 900); });
  };
})();
