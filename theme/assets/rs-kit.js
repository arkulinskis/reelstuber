/* rs-kit.js: the small window.UI helpers Reelstuber's JavaScript engines (rs-core/smart/engine/screens.js) were
   written against, now that the app itself is Python Forms. Loaded after app-kit.js (UI.esc, UI.store, UI.icon,
   UI.ICONS, light/dark) and before the engines.

   Server:   UI.api(fn, ...args) / UI.apiQuiet go through window.RS_BRIDGE, a Python function set by client_code/rs.py
             (anvil.server.call there). A reply {ok: false, error} rejects with err.expected = true; errors nobody
             catches become a toast.
   Host:     RS.host = Python functions (client_code/rs.py): toast, confirm, go. UI.toast / UI.confirm use them, so the
             engines show the same notifications and dialogs as the Forms.
   Screens:  UI.page(name, opts, mount) keeps an engine screen in UI.pages; Components/Screen mounts it.
   Also:     UI.me (set by Python on start, sign in and sign out), UI.go, UI.busy, UI.ago, UI.fmtDate, UI.formData,
             UI.modal (plain dialogs the editors build themselves), UI.feedback, [data-go] and [data-feedback] clicks. */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  var RS = window.RS = window.RS || {};
  UI.pages = UI.pages || {};
  UI.me = UI.me || null;
  RS.host = RS.host || {};

  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  /* Mount an engine screen into el. Returns {ready: Promise, destroy()}; UI_READY turns true when it has loaded. */
  UI.mountScreen = function (name, el, args) {
    var p = UI.pages[name];
    if (!p) throw new Error('No screen called ' + name);
    window.UI_READY = false;
    var out = p.mount(el, { name: name, args: args || [], me: UI.me, go: UI.go, api: UI.api, page: p });
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    ready = Promise.resolve(ready).then(function (v) { window.UI_READY = true; return v; },
      function (e) { window.UI_READY = true; if (e && e.message) UI.toast(e.message, 'error'); });
    return { ready: ready, destroy: (out && out.destroy) || function () {} };
  };

  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function () {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h && RS.host.go) RS.host.go(h); else location.hash = h;
  };
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    window.open('https://prepsto.com/#f/m9ke3hk', '_blank', 'noopener');
  };

  /* ------------------------------------------------------------------ toasts and dialogs */
  UI.toast = function (msg, kind) {
    if (RS.host.toast) { try { RS.host.toast(String(msg), kind || ''); return; } catch (e) { /* fall through */ } }
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, kind === 'error' ? 6500 : 3200);
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    if (RS.host.confirm) return Promise.resolve(RS.host.confirm(JSON.stringify(o))).then(function (v) { return !!v; });
    return Promise.resolve(window.confirm(o.title || 'Are you sure?'));
  };
  /* The editors' own dialogs (chapters, captions, storyboard, export progress ...): plain markup they wire themselves. */
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement, wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" tabindex="-1">' +
      '<button type="button" class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select') || wrap.querySelector('.ui-modal');
    setTimeout(function () { if (first && first.focus) first.focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };

  /* ------------------------------------------------------------------ the server, through Python */
  function send(kind, payload) {
    if (!window.RS_BRIDGE) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = window.RS_BRIDGE(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function expected(res) {
    if (res && typeof res === 'object' && res.ok === false) {
      var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
      throw err;
    }
    return res;
  }
  UI.api = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: false }).then(expected); };
  UI.apiQuiet = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: true }).then(expected); };
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* [data-go="page/arg"] and [data-feedback] inside engine markup (back buttons, empty states) */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback]');
    if (!el) return;
    e.preventDefault();
    if (el.hasAttribute('data-go')) UI.go.apply(null, el.getAttribute('data-go').split('/'));
    else UI.feedback();
  });

  /* Python gets JSON text from the engines' promises (RS.json.*): real dicts on the Python side, no JS proxies. */
  RS.json = {
    db: function (method, argsJson) {
      var args = argsJson ? JSON.parse(argsJson) : [];
      return Promise.resolve(RS.db[method].apply(RS.db, args)).then(function (r) { return JSON.stringify(r === undefined ? null : r); });
    },
    looks: function () { return JSON.stringify(RS.LOOKS); },
    lists: function () {
      return JSON.stringify({ fonts: RS.FONTS, grades: RS.GRADES, trans: RS.TRANS, lookKeys: RS.LOOK_KEYS, canExport: RS.canExport ? RS.canExport() : true });
    },
    fullStyle: function (kitJson) { return JSON.stringify(RS.fullStyle(JSON.parse(kitJson || '{}'))); },
    applyLook: function (stJson, lookJson, key) { return JSON.stringify(RS.applyLook(JSON.parse(stJson), JSON.parse(lookJson), key)); }
  };
  /* The Studio's drop zone (Pages/Home): a <label> around a hidden file input. Dropping or choosing a file starts a
     project (RS.startProject in rs-screens.js); the [data-sample] button inside opens the sample instead. */
  RS.wireDrop = function (drop, input) {
    drop.addEventListener('click', function (e) {
      if (e.target.closest('[data-sample]')) { e.preventDefault(); RS.startSample(); }
    });
    input.addEventListener('change', function () { RS.startProject(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) RS.startProject(f); });
  };
  /* Move the projects a guest made in this browser into the new account (and their kept videos). Resolves to the count. */
  RS.importLocal = function () {
    var local = RS.db.localProjects();
    return UI.api('projects_import', local).then(function (r) {
      return Promise.all(r.imported.map(function (x) {
        return RS.vault.get('video-' + x.local_id).then(function (f) {
          return f ? RS.vault.save('video-' + x.id, f).then(function () { return RS.vault.drop('video-' + x.local_id); }) : null;
        });
      })).then(function () {
        RS.db.forgetLocal(local.map(function (p) { return p.id; }));
        return r.imported.length;
      });
    });
  };
  /* Draw a style preview into a canvas: style and options as JSON text. */
  RS.previewJson = function (canvas, styleJson, optsJson) {
    return Promise.resolve(RS.fontsReady ? RS.fontsReady() : null).then(function () {
      RS.stylePreview(canvas, JSON.parse(styleJson), JSON.parse(optsJson || '{}'));
    });
  };
})();
